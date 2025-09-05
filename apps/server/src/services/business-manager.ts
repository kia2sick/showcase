import { Business, BusinessCreate, BusinessSession } from '../types/business.js';
import { createLogger } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

const logger = createLogger('business-manager');

/**
 * Multi-tenant business management service
 * Handles multiple businesses and their voice AI configurations
 */
export class BusinessManager {
  private businesses = new Map<string, Business>();
  private sessions = new Map<string, BusinessSession>();
  private phoneNumberMap = new Map<string, string>(); // phoneNumber -> businessId

  constructor() {
    this.loadDefaultBusinesses();
    logger.info('Business manager initialized');
  }

  /**
   * Create a new business
   */
  createBusiness(data: BusinessCreate): Business {
    const business: Business = {
      ...data,
      id: uuidv4(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      phoneNumbers: [],
      usage: {
        currentMonth: {
          totalCalls: 0,
          totalMinutes: 0,
          successfulLeads: 0,
          cost: 0,
        },
        limits: {
          maxCalls: this.getPlanLimits(data.plan).maxCalls,
          maxMinutes: this.getPlanLimits(data.plan).maxMinutes,
          maxPhoneNumbers: this.getPlanLimits(data.plan).maxPhoneNumbers,
        },
      },
    };

    this.businesses.set(business.id, business);
    
    logger.info({
      businessId: business.id,
      name: business.name,
      industry: business.industry,
      plan: business.plan,
    }, 'New business created');

    return business;
  }

  /**
   * Get business by ID
   */
  getBusiness(businessId: string): Business | undefined {
    return this.businesses.get(businessId);
  }

  /**
   * Get business by phone number
   */
  getBusinessByPhone(phoneNumber: string): Business | undefined {
    const businessId = this.phoneNumberMap.get(phoneNumber);
    return businessId ? this.businesses.get(businessId) : undefined;
  }

  /**
   * Assign phone number to business
   */
  assignPhoneNumber(businessId: string, phoneNumber: string, vapiAssistantId?: string): boolean {
    const business = this.businesses.get(businessId);
    if (!business) return false;

    // Check if business has reached phone number limit
    if (business.phoneNumbers.length >= business.usage.limits.maxPhoneNumbers) {
      logger.warn({
        businessId,
        currentCount: business.phoneNumbers.length,
        limit: business.usage.limits.maxPhoneNumbers,
      }, 'Phone number limit reached');
      return false;
    }

    // Check if phone number is already assigned
    if (this.phoneNumberMap.has(phoneNumber)) {
      logger.warn({ phoneNumber }, 'Phone number already assigned');
      return false;
    }

    // Assign phone number
    business.phoneNumbers.push({
      number: phoneNumber,
      provider: 'vapi',
      vapiAssistantId,
      isActive: true,
      assignedAt: Date.now(),
    });

    business.updatedAt = Date.now();
    this.phoneNumberMap.set(phoneNumber, businessId);

    logger.info({
      businessId,
      phoneNumber,
      vapiAssistantId,
    }, 'Phone number assigned to business');

    return true;
  }

  /**
   * Start a new call session
   */
  startSession(phoneNumber: string, customerPhone: string, callId: string): BusinessSession | null {
    const business = this.getBusinessByPhone(phoneNumber);
    if (!business) {
      logger.warn({ phoneNumber }, 'No business found for phone number');
      return null;
    }

    const session: BusinessSession = {
      businessId: business.id,
      callId,
      phoneNumber,
      customerPhone,
      startTime: Date.now(),
      transcript: [],
      collectedData: {},
      leadCaptured: false,
      bookingMade: false,
      crmSynced: false,
    };

    this.sessions.set(callId, session);

    // Update business usage
    business.usage.currentMonth.totalCalls++;
    business.updatedAt = Date.now();

    logger.info({
      businessId: business.id,
      callId,
      customerPhone,
      businessName: business.name,
    }, 'Call session started');

    return session;
  }

  /**
   * End a call session
   */
  endSession(callId: string, outcome: 'completed' | 'abandoned' | 'transferred' | 'failed'): void {
    const session = this.sessions.get(callId);
    if (!session) return;

    const business = this.businesses.get(session.businessId);
    if (!business) return;

    // Update session
    session.endTime = Date.now();
    session.duration = Math.round((session.endTime - session.startTime) / 1000);
    session.outcome = outcome;

    // Update business usage
    business.usage.currentMonth.totalMinutes += Math.round(session.duration / 60);
    if (session.leadCaptured) {
      business.usage.currentMonth.successfulLeads++;
    }

    business.updatedAt = Date.now();

    logger.info({
      businessId: business.id,
      callId,
      duration: session.duration,
      outcome,
      leadCaptured: session.leadCaptured,
    }, 'Call session ended');
  }

  /**
   * Get session by call ID
   */
  getSession(callId: string): BusinessSession | undefined {
    return this.sessions.get(callId);
  }

  /**
   * Get all businesses
   */
  getAllBusinesses(): Business[] {
    return Array.from(this.businesses.values());
  }

  /**
   * Get active sessions for a business
   */
  getActiveSessionsForBusiness(businessId: string): BusinessSession[] {
    return Array.from(this.sessions.values()).filter(
      session => session.businessId === businessId && !session.endTime
    );
  }

  /**
   * Get business statistics
   */
  getBusinessStats(businessId: string) {
    const business = this.businesses.get(businessId);
    if (!business) return null;

    const allSessions = Array.from(this.sessions.values())
      .filter(session => session.businessId === businessId);
    
    const activeSessions = allSessions.filter(session => !session.endTime);
    const completedSessions = allSessions.filter(session => session.endTime);

    return {
      business: {
        name: business.name,
        industry: business.industry,
        plan: business.plan,
        status: business.status,
      },
      usage: business.usage,
      phoneNumbers: business.phoneNumbers.length,
      sessions: {
        total: allSessions.length,
        active: activeSessions.length,
        completed: completedSessions.length,
      },
      performance: {
        avgDuration: completedSessions.length > 0 
          ? Math.round(completedSessions.reduce((sum, s) => sum + (s.duration || 0), 0) / completedSessions.length)
          : 0,
        conversionRate: completedSessions.length > 0
          ? Math.round((completedSessions.filter(s => s.leadCaptured).length / completedSessions.length) * 100)
          : 0,
      },
    };
  }

  /**
   * Get platform-wide statistics
   */
  getPlatformStats() {
    const businesses = Array.from(this.businesses.values());
    const sessions = Array.from(this.sessions.values());
    const activeSessions = sessions.filter(s => !s.endTime);

    return {
      businesses: {
        total: businesses.length,
        active: businesses.filter(b => b.status === 'active').length,
        trial: businesses.filter(b => b.status === 'trial').length,
      },
      sessions: {
        total: sessions.length,
        active: activeSessions.length,
        today: sessions.filter(s => s.startTime > Date.now() - 24 * 60 * 60 * 1000).length,
      },
      usage: {
        totalCalls: businesses.reduce((sum, b) => sum + b.usage.currentMonth.totalCalls, 0),
        totalMinutes: businesses.reduce((sum, b) => sum + b.usage.currentMonth.totalMinutes, 0),
        totalLeads: businesses.reduce((sum, b) => sum + b.usage.currentMonth.successfulLeads, 0),
      },
      phoneNumbers: businesses.reduce((sum, b) => sum + b.phoneNumbers.length, 0),
    };
  }

  /**
   * Get plan limits
   */
  private getPlanLimits(plan: 'starter' | 'professional' | 'enterprise') {
    const limits = {
      starter: { maxCalls: 1000, maxMinutes: 2000, maxPhoneNumbers: 1 },
      professional: { maxCalls: 5000, maxMinutes: 10000, maxPhoneNumbers: 5 },
      enterprise: { maxCalls: 50000, maxMinutes: 100000, maxPhoneNumbers: 25 },
    };
    return limits[plan];
  }

  /**
   * Load default demo businesses
   */
  private loadDefaultBusinesses() {
    // Demo Restaurant
    const restaurant = this.createBusiness({
      name: "Mario's Italian Restaurant",
      industry: 'restaurant',
      plan: 'professional',
      status: 'active',
      contact: {
        email: 'mario@mariosrestaurant.com',
        phone: '+1234567890',
        name: 'Mario Rossi',
        company: "Mario's Italian Restaurant",
      },
      voiceConfig: {
        primaryIntent: 'booking',
        businessHours: {
          timezone: 'America/New_York',
          monday: { open: '11:00', close: '22:00' },
          tuesday: { open: '11:00', close: '22:00' },
          wednesday: { open: '11:00', close: '22:00' },
          thursday: { open: '11:00', close: '22:00' },
          friday: { open: '11:00', close: '23:00' },
          saturday: { open: '11:00', close: '23:00' },
          sunday: { open: '12:00', close: '21:00' },
        },
        customPrompts: {
          greeting: "Ciao! Welcome to Mario's Italian Restaurant!",
          businessInfo: "We serve authentic Italian cuisine with fresh ingredients. We're known for our homemade pasta and wood-fired pizza.",
          specialInstructions: "Always mention our daily specials and wine pairings. Be warm and welcoming like a traditional Italian host.",
        },
        voice: {
          provider: 'elevenlabs',
          speed: 1.0,
          tone: 'friendly',
        },
      },
      integrations: {},
    });

    // Demo Healthcare Practice
    const healthcare = this.createBusiness({
      name: 'Sunny Valley Medical Center',
      industry: 'healthcare',
      plan: 'enterprise',
      status: 'active',
      contact: {
        email: 'admin@sunnyvalleymed.com',
        phone: '+1987654321',
        name: 'Dr. Sarah Johnson',
        company: 'Sunny Valley Medical Center',
      },
      voiceConfig: {
        primaryIntent: 'booking',
        businessHours: {
          timezone: 'America/New_York',
          monday: { open: '08:00', close: '17:00' },
          tuesday: { open: '08:00', close: '17:00' },
          wednesday: { open: '08:00', close: '17:00' },
          thursday: { open: '08:00', close: '17:00' },
          friday: { open: '08:00', close: '17:00' },
        },
        customPrompts: {
          greeting: "Thank you for calling Sunny Valley Medical Center.",
          businessInfo: "We provide comprehensive healthcare services including family medicine, urgent care, and specialist consultations.",
          specialInstructions: "Always be professional and empathetic. Ask about insurance and preferred appointment times. Remind patients to bring ID and insurance cards.",
        },
        voice: {
          provider: 'elevenlabs',
          speed: 0.9,
          tone: 'professional',
        },
      },
      integrations: {},
    });

    logger.info({
      restaurantId: restaurant.id,
      healthcareId: healthcare.id,
    }, 'Demo businesses created');
  }
}

// Singleton instance
export const businessManager = new BusinessManager();
