import { ExtendedSession } from '../types/session.js';
import { hasRequiredData, getMissingFields } from '../memory/selectors.js';
import { sessionStore } from '../memory/session-store.js';
import { availabilityState } from '../state/availability.js';
import { airtableService } from '../services/airtable.js';
import { agentLogger as logger } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import path from 'path';

/**
 * Booking Agent
 * Focuses on making restaurant reservations
 */
export class BookingAgent {
  private systemPrompt: string = '';

  constructor() {
    this.loadSystemPrompt();
  }

  /**
   * Load system prompt from file
   */
  private async loadSystemPrompt() {
    try {
      const promptPath = path.join(process.cwd(), 'src/llm/system/booking.md');
      this.systemPrompt = await fs.readFile(promptPath, 'utf-8');
    } catch (error) {
      logger.warn('Could not load booking system prompt, using fallback');
      this.systemPrompt = this.getFallbackPrompt();
    }
  }

  /**
   * Generate response for booking
   */
  async respond(session: ExtendedSession, userInput: string): Promise<string> {
    logger.debug({
      callId: session.callId,
      collected: session.collected,
      userInput: userInput.substring(0, 100),
    }, 'Booking agent processing input');

    // Check if we have all required data and confirmed availability
    if (hasRequiredData(session, 'booking') && this.hasConfirmedReservation(session)) {
      return await this.handleCompleteBooking(session, userInput);
    }

    // Extract information from user input
    await this.extractInformation(session, userInput);

    // Generate appropriate response based on current state
    return await this.generateResponse(session, userInput);
  }

  /**
   * Extract booking information from user input
   */
  private async extractInformation(session: ExtendedSession, userInput: string): Promise<void> {
    const input = userInput.toLowerCase();

    // Extract name
    if (!session.collected.name) {
      const namePatterns = [
        /my name is ([a-zA-Z\s]+)/i,
        /i'm ([a-zA-Z\s]+)/i,
        /this is ([a-zA-Z\s]+)/i,
        /under ([a-zA-Z\s]+)/i,
        /for ([a-zA-Z\s]+)/i,
      ];

      for (const pattern of namePatterns) {
        const match = userInput.match(pattern);
        if (match) {
          const name = match[1].trim();
          if (name.length > 1 && name.length < 50 && !this.isCommonWord(name)) {
            sessionStore.updateCollected(session.callId, { name });
            logger.debug({ callId: session.callId, name }, 'Extracted name');
            break;
          }
        }
      }
    }

    // Extract party size
    if (!session.collected.partySize) {
      const partySizePatterns = [
        /for (\d+) people/i,
        /(\d+) people/i,
        /party of (\d+)/i,
        /table for (\d+)/i,
        /(\d+) person/i,
      ];

      for (const pattern of partySizePatterns) {
        const match = userInput.match(pattern);
        if (match) {
          const size = parseInt(match[1]);
          if (size > 0 && size <= 20) {
            sessionStore.updateCollected(session.callId, { partySize: size });
            logger.debug({ callId: session.callId, partySize: size }, 'Extracted party size');
            break;
          }
        }
      }
    }

    // Extract date and time
    if (!session.collected.dateTime) {
      const dateTime = this.extractDateTime(userInput);
      if (dateTime) {
        sessionStore.updateCollected(session.callId, { dateTime });
        logger.debug({ callId: session.callId, dateTime }, 'Extracted date/time');
      }
    }

    // Extract phone number
    if (!session.collected.phone) {
      const phonePattern = /(\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/;
      const phoneMatch = userInput.match(phonePattern);
      
      if (phoneMatch) {
        const phone = phoneMatch[0];
        sessionStore.updateCollected(session.callId, { phone });
        logger.debug({ callId: session.callId, phone }, 'Extracted phone');
      }
    }

    // Extract special requests
    if (input.includes('special') || input.includes('request') || input.includes('need')) {
      const specialRequests = this.extractSpecialRequests(userInput);
      if (specialRequests) {
        sessionStore.updateCollected(session.callId, { specialRequests });
      }
    }
  }

  /**
   * Extract date and time from user input
   */
  private extractDateTime(userInput: string): string | null {
    const input = userInput.toLowerCase();
    const today = new Date();
    
    // Handle relative dates
    if (input.includes('tonight')) {
      const time = this.extractTime(userInput) || '19:00';
      return `${today.toISOString().split('T')[0]} ${time}`;
    }
    
    if (input.includes('tomorrow')) {
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);
      const time = this.extractTime(userInput) || '19:00';
      return `${tomorrow.toISOString().split('T')[0]} ${time}`;
    }

    // Handle specific dates (simple patterns)
    const datePatterns = [
      /(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/,  // MM/DD or MM/DD/YY
      /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})/i,
    ];

    for (const pattern of datePatterns) {
      const match = userInput.match(pattern);
      if (match) {
        // Simple date parsing - would need more robust implementation
        const time = this.extractTime(userInput) || '19:00';
        // For demo, return today's date with extracted time
        return `${today.toISOString().split('T')[0]} ${time}`;
      }
    }

    return null;
  }

  /**
   * Extract time from user input
   */
  private extractTime(userInput: string): string | null {
    const timePatterns = [
      /(\d{1,2}):(\d{2})\s*(am|pm)/i,
      /(\d{1,2})\s*(am|pm)/i,
      /(\d{1,2}):(\d{2})/,
    ];

    for (const pattern of timePatterns) {
      const match = userInput.match(pattern);
      if (match) {
        let hours = parseInt(match[1]);
        const minutes = match[2] ? parseInt(match[2]) : 0;
        const period = match[3]?.toLowerCase();

        if (period === 'pm' && hours < 12) hours += 12;
        if (period === 'am' && hours === 12) hours = 0;

        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
      }
    }

    return null;
  }

  /**
   * Extract special requests
   */
  private extractSpecialRequests(userInput: string): string | null {
    const requestKeywords = [
      'birthday', 'anniversary', 'celebration', 'window', 'quiet',
      'allergy', 'vegetarian', 'vegan', 'gluten', 'wheelchair'
    ];

    const input = userInput.toLowerCase();
    const foundRequests = requestKeywords.filter(keyword => input.includes(keyword));
    
    if (foundRequests.length > 0) {
      return userInput; // Return full input to preserve context
    }

    return null;
  }

  /**
   * Generate response based on current state
   */
  private async generateResponse(session: ExtendedSession, userInput: string): Promise<string> {
    const missing = getMissingFields(session, 'booking');

    // First interaction - understand the booking request
    if (session.transcript.length <= 1) {
      return "I'd be happy to help you make a reservation! When would you like to dine with us and for how many people?";
    }

    // Need party size
    if (missing.includes('party size')) {
      return "Great! How many people will be joining you?";
    }

    // Need date/time
    if (missing.includes('date and time')) {
      if (session.collected.partySize) {
        return `Perfect! For ${session.collected.partySize} people, what date and time would work best for you?`;
      } else {
        return "What date and time would work best for you?";
      }
    }

    // Have basic booking info, check availability
    if (session.collected.partySize && session.collected.dateTime) {
      return await this.checkAvailabilityAndRespond(session);
    }

    // Need name for reservation
    if (missing.includes('name')) {
      return "Excellent! What name should I put this reservation under?";
    }

    // All required info collected
    return this.generateConfirmationResponse(session);
  }

  /**
   * Check availability and respond appropriately
   */
  private async checkAvailabilityAndRespond(session: ExtendedSession): Promise<string> {
    const { partySize, dateTime } = session.collected;
    
    if (!partySize || !dateTime) {
      return "I need both the party size and date/time to check availability.";
    }

    // Parse date from dateTime
    const date = dateTime.split(' ')[0];
    const time = dateTime.split(' ')[1] || '19:00';

    // Check if specific time is available
    const isAvailable = availabilityState.isTimeSlotAvailable(date, time, partySize);
    
    if (isAvailable) {
      return `Great news! I have availability for ${partySize} people on ${this.formatDateForSpeech(date)} at ${this.formatTimeForSpeech(time)}. What name should I put this reservation under?`;
    } else {
      // Offer alternatives
      const alternatives = availabilityState.formatAvailabilityForVoice(date, partySize);
      return alternatives;
    }
  }

  /**
   * Generate confirmation response
   */
  private generateConfirmationResponse(session: ExtendedSession): string {
    const { name, partySize, dateTime } = session.collected;
    
    if (name && partySize && dateTime) {
      const date = dateTime.split(' ')[0];
      const time = dateTime.split(' ')[1] || '19:00';
      
      return `Perfect! Let me confirm your reservation: ${name} for ${partySize} people on ${this.formatDateForSpeech(date)} at ${this.formatTimeForSpeech(time)}. Is that correct?`;
    }
    
    return "Let me confirm all the details for your reservation.";
  }

  /**
   * Handle complete booking
   */
  private async handleCompleteBooking(session: ExtendedSession, userInput: string): Promise<string> {
    // Check if user is confirming the reservation
    if (this.isConfirmation(userInput)) {
      return await this.finalizeReservation(session);
    }

    // Check if user wants to modify something
    if (this.isModificationRequest(userInput)) {
      return "Of course! What would you like to change about your reservation?";
    }

    // Default to asking for confirmation
    return "Would you like me to confirm this reservation for you?";
  }

  /**
   * Finalize the reservation
   */
  private async finalizeReservation(session: ExtendedSession): Promise<string> {
    const { name, partySize, dateTime, phone, specialRequests } = session.collected;
    
    if (!name || !partySize || !dateTime) {
      return "I'm missing some information. Let me get the complete details for your reservation.";
    }

    try {
      const idempotencyKey = uuidv4();
      const date = dateTime.split(' ')[0];
      const time = dateTime.split(' ')[1] || '19:00';

      // Add pending CRM action
      sessionStore.addCRMAction(session.callId, {
        type: 'airtable_reservation',
        status: 'pending',
        timestamp: Date.now(),
        data: {
          name,
          partySize,
          dateTime: `${date} ${time}`,
          phone: phone || '',
          specialRequests: specialRequests || '',
        },
        idempotencyKey,
      });

      // Reserve the time slot
      const reserved = availabilityState.reserveSlot(date, time, partySize, {
        name,
        phone: phone || '',
        specialRequests: specialRequests || '',
      });

      if (!reserved) {
        sessionStore.updateCRMAction(session.callId, idempotencyKey, {
          status: 'failed',
          error: 'Time slot no longer available',
        });
        return "I'm sorry, but that time slot is no longer available. Let me check other options for you.";
      }

      // Create Airtable reservation
      const reservationResult = await airtableService.createReservation({
        'Name': name,
        'Phone': phone || '',
        'Party Size': partySize,
        'Date & Time': `${date}T${time}:00.000Z`,
        'Special Requests': specialRequests || '',
        'Status': 'Confirmed',
        'Source': 'Voice Agent',
      }, idempotencyKey);

      // Update CRM action status
      sessionStore.updateCRMAction(session.callId, idempotencyKey, {
        status: 'success',
        data: { 
          ...session.crmActions.find(a => a.idempotencyKey === idempotencyKey)?.data,
          reservationResult 
        },
      });

      logger.info({
        callId: session.callId,
        name,
        dateTime,
        partySize,
        reservationId: reservationResult.id,
      }, 'Reservation created successfully');

      return this.generateSuccessResponse(session);

    } catch (error) {
      logger.error({
        error,
        callId: session.callId,
        name,
        dateTime,
        partySize,
      }, 'Failed to create reservation');

      return "I apologize, but I'm having trouble finalizing your reservation right now. Let me get your phone number and have someone call you back to confirm your booking.";
    }
  }

  /**
   * Generate success response
   */
  private generateSuccessResponse(session: ExtendedSession): string {
    const { name, partySize, dateTime } = session.collected;
    const date = dateTime?.split(' ')[0] || '';
    const time = dateTime?.split(' ')[1] || '';

    let response = `Wonderful! Your reservation is confirmed. ${name} for ${partySize} people on ${this.formatDateForSpeech(date)} at ${this.formatTimeForSpeech(time)}.`;
    
    if (session.collected.specialRequests) {
      response += " We've noted your special requests.";
    }
    
    response += " We'll see you then! Is there anything else I can help you with today?";
    
    return response;
  }

  /**
   * Check if reservation is confirmed in session
   */
  private hasConfirmedReservation(session: ExtendedSession): boolean {
    return session.crmActions.some(
      action => action.type === 'airtable_reservation' && action.status === 'success'
    );
  }

  /**
   * Check if user input is a confirmation
   */
  private isConfirmation(userInput: string): boolean {
    const confirmationWords = ['yes', 'yeah', 'yep', 'correct', 'right', 'confirm', 'book it'];
    const input = userInput.toLowerCase();
    return confirmationWords.some(word => input.includes(word));
  }

  /**
   * Check if user wants to modify reservation
   */
  private isModificationRequest(userInput: string): boolean {
    const modificationWords = ['change', 'modify', 'different', 'actually', 'wait'];
    const input = userInput.toLowerCase();
    return modificationWords.some(word => input.includes(word));
  }

  /**
   * Check if word is a common word (not a name)
   */
  private isCommonWord(word: string): boolean {
    const commonWords = ['tonight', 'tomorrow', 'today', 'people', 'person', 'table', 'dinner', 'lunch'];
    return commonWords.includes(word.toLowerCase());
  }

  /**
   * Format date for speech
   */
  private formatDateForSpeech(date: string): string {
    const dateObj = new Date(date + 'T00:00:00');
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    if (date === today.toISOString().split('T')[0]) {
      return 'today';
    } else if (date === tomorrow.toISOString().split('T')[0]) {
      return 'tomorrow';
    } else {
      return dateObj.toLocaleDateString('en-US', { 
        weekday: 'long', 
        month: 'long', 
        day: 'numeric' 
      });
    }
  }

  /**
   * Format time for speech
   */
  private formatTimeForSpeech(time: string): string {
    const [hours, minutes] = time.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
    const displayMinutes = minutes === 0 ? '' : `:${minutes.toString().padStart(2, '0')}`;
    
    return `${displayHours}${displayMinutes} ${period}`;
  }

  /**
   * Get fallback system prompt
   */
  private getFallbackPrompt(): string {
    return `You are a booking agent for a restaurant. Your goal is to collect reservation details (name, party size, date/time) and confirm availability. Be helpful and efficient.`;
  }

  /**
   * Get agent info
   */
  getInfo() {
    return {
      name: 'Booking Agent',
      intent: 'booking',
      requiredFields: ['name', 'partySize', 'dateTime'],
      optionalFields: ['phone', 'specialRequests'],
      capabilities: ['availability_checking', 'airtable_integration', 'reservation_management'],
    };
  }
}
