import { Request, Response } from 'express';
import { businessManager } from '../services/business-manager.js';
import { vapiService } from '../services/vapi.js';
import { BusinessCreateSchema } from '../types/business.js';
import { serverLogger as logger } from '../utils/logger.js';
import { forLogging } from '../utils/redact.js';

/**
 * Business Management API Routes
 * Multi-tenant SaaS platform endpoints
 */

/**
 * Create a new business
 */
export async function createBusiness(req: Request, res: Response) {
  try {
    const businessData = BusinessCreateSchema.parse(req.body);
    const business = businessManager.createBusiness(businessData);

    logger.info({
      businessId: business.id,
      name: business.name,
      industry: business.industry,
    }, 'New business created via API');

    res.status(201).json({
      success: true,
      business: {
        id: business.id,
        name: business.name,
        industry: business.industry,
        plan: business.plan,
        status: business.status,
        phoneNumbers: business.phoneNumbers,
        createdAt: business.createdAt,
      },
    });
  } catch (error) {
    logger.error({ error, body: forLogging(req.body) }, 'Failed to create business');
    res.status(400).json({
      success: false,
      error: 'Invalid business data',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Get all businesses
 */
export async function getBusinesses(req: Request, res: Response) {
  try {
    const businesses = businessManager.getAllBusinesses().map(business => ({
      id: business.id,
      name: business.name,
      industry: business.industry,
      plan: business.plan,
      status: business.status,
      phoneNumbers: business.phoneNumbers.length,
      totalCalls: business.usage.currentMonth.totalCalls,
      totalMinutes: business.usage.currentMonth.totalMinutes,
      successfulLeads: business.usage.currentMonth.successfulLeads,
      createdAt: business.createdAt,
    }));

    res.json({
      success: true,
      businesses,
      total: businesses.length,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get businesses');
    res.status(500).json({
      success: false,
      error: 'Failed to fetch businesses',
    });
  }
}

/**
 * Get business details
 */
export async function getBusinessDetails(req: Request, res: Response) {
  try {
    const { businessId } = req.params;
    const business = businessManager.getBusiness(businessId);

    if (!business) {
      return res.status(404).json({
        success: false,
        error: 'Business not found',
      });
    }

    const stats = businessManager.getBusinessStats(businessId);
    const activeSessions = businessManager.getActiveSessionsForBusiness(businessId);

    res.json({
      success: true,
      business: {
        ...business,
        // Redact sensitive data
        integrations: Object.keys(business.integrations),
      },
      stats,
      activeSessions: activeSessions.map(session => ({
        callId: session.callId,
        customerPhone: session.customerPhone,
        startTime: session.startTime,
        duration: session.endTime ? session.duration : Math.round((Date.now() - session.startTime) / 1000),
        intent: session.intent,
        leadCaptured: session.leadCaptured,
      })),
    });
  } catch (error) {
    logger.error({ error, businessId: req.params.businessId }, 'Failed to get business details');
    res.status(500).json({
      success: false,
      error: 'Failed to fetch business details',
    });
  }
}

/**
 * Assign phone number to business
 */
export async function assignPhoneNumber(req: Request, res: Response) {
  try {
    const { businessId } = req.params;
    const { phoneNumber, vapiAssistantId } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        error: 'Phone number is required',
      });
    }

    const success = businessManager.assignPhoneNumber(businessId, phoneNumber, vapiAssistantId);

    if (!success) {
      return res.status(400).json({
        success: false,
        error: 'Failed to assign phone number. Check business limits or if number is already assigned.',
      });
    }

    logger.info({
      businessId,
      phoneNumber,
      vapiAssistantId,
    }, 'Phone number assigned to business');

    res.json({
      success: true,
      message: 'Phone number assigned successfully',
      phoneNumber,
    });
  } catch (error) {
    logger.error({
      error,
      businessId: req.params.businessId,
      body: req.body,
    }, 'Failed to assign phone number');

    res.status(500).json({
      success: false,
      error: 'Failed to assign phone number',
    });
  }
}

/**
 * Initiate call for specific business
 */
export async function initiateBusinessCall(req: Request, res: Response) {
  try {
    const { businessId } = req.params;
    const { customerPhone, message } = req.body;

    const business = businessManager.getBusiness(businessId);
    if (!business) {
      return res.status(404).json({
        success: false,
        error: 'Business not found',
      });
    }

    if (!vapiService.isOutboundEnabled()) {
      return res.status(400).json({
        success: false,
        error: 'Outbound calling not enabled',
      });
    }

    // Use first available phone number for the business
    const phoneNumber = business.phoneNumbers.find(p => p.isActive);
    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        error: 'No active phone numbers assigned to this business',
      });
    }

    const callRequest = {
      assistantId: phoneNumber.vapiAssistantId || process.env.VAPI_ASSISTANT_ID!,
      phoneNumber: customerPhone,
      customer: {
        number: customerPhone,
        name: `Customer for ${business.name}`,
      },
      metadata: {
        businessId,
        businessName: business.name,
        initiatedBy: 'admin',
        customMessage: message,
        timestamp: new Date().toISOString(),
      },
    };

    const result = await vapiService.createOutboundCall(callRequest);

    logger.info({
      businessId,
      businessName: business.name,
      customerPhone,
      callId: result.id,
    }, 'Outbound call initiated for business');

    res.json({
      success: true,
      callId: result.id,
      businessName: business.name,
      customerPhone,
      status: result.status || 'initiated',
    });
  } catch (error) {
    logger.error({
      error,
      businessId: req.params.businessId,
      body: req.body,
    }, 'Failed to initiate business call');

    res.status(500).json({
      success: false,
      error: 'Failed to initiate call',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Get platform statistics
 */
export async function getPlatformStats(req: Request, res: Response) {
  try {
    const stats = businessManager.getPlatformStats();

    res.json({
      success: true,
      platform: stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get platform stats');
    res.status(500).json({
      success: false,
      error: 'Failed to fetch platform statistics',
    });
  }
}

/**
 * Quick setup for demo/testing
 */
export async function quickSetup(req: Request, res: Response) {
  try {
    const { businessName, industry, phoneNumber, vapiAssistantId } = req.body;

    // Create business
    const business = businessManager.createBusiness({
      name: businessName || 'Demo Business',
      industry: industry || 'other',
      plan: 'professional',
      status: 'active',
      contact: {
        email: 'demo@example.com',
        phone: phoneNumber || '+1234567890',
        name: 'Demo User',
        company: businessName || 'Demo Business',
      },
      voiceConfig: {
        primaryIntent: 'lead_capture',
        businessHours: {
          timezone: 'America/New_York',
        },
        customPrompts: {
          businessInfo: `We are ${businessName || 'a demo business'} and we're here to help you!`,
        },
        voice: {
          provider: 'elevenlabs',
          speed: 1.0,
          tone: 'friendly',
        },
      },
      integrations: {},
    });

    // Assign phone number if provided
    if (phoneNumber) {
      businessManager.assignPhoneNumber(business.id, phoneNumber, vapiAssistantId);
    }

    logger.info({
      businessId: business.id,
      businessName,
      phoneNumber,
    }, 'Quick setup completed');

    res.json({
      success: true,
      message: 'Business setup completed successfully!',
      business: {
        id: business.id,
        name: business.name,
        phoneNumber,
        webhookUrl: `${process.env.BASE_URL}/vapi/events`,
      },
      nextSteps: [
        'Configure your Vapi assistant webhook URL',
        'Test calling the assigned phone number',
        'Customize voice settings and prompts',
        'Set up CRM integrations',
      ],
    });
  } catch (error) {
    logger.error({ error, body: req.body }, 'Quick setup failed');
    res.status(500).json({
      success: false,
      error: 'Quick setup failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
