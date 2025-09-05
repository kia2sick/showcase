import { ExtendedSession, Intent } from '../types/session.js';
import { LeadAgent } from './lead.js';
import { BookingAgent } from './booking.js';
import { MenuAgent } from './menu.js';
import { checkPolicyOverrides } from '../llm/policy/overrides.js';
import { getIntentConfidence } from '../memory/selectors.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('agent-router');

/**
 * Agent Router
 * Routes conversations to appropriate intent-specific agents
 */
export class AgentRouter {
  private leadAgent = new LeadAgent();
  private bookingAgent = new BookingAgent();
  private menuAgent = new MenuAgent();

  /**
   * Process incoming message and generate response
   */
  async processMessage(session: ExtendedSession, userInput: string): Promise<string> {
    try {
      logger.debug({
        callId: session.callId,
        currentIntent: session.currentIntent,
        userInput: userInput.substring(0, 100),
      }, 'Processing message');

      // Check for policy overrides first
      const policyResponse = checkPolicyOverrides(session, userInput);
      if (policyResponse) {
        return policyResponse;
      }

      // Determine intent if not already set
      if (!session.currentIntent) {
        const intent = await this.detectIntent(session, userInput);
        session.currentIntent = intent;
        logger.info({ callId: session.callId, detectedIntent: intent }, 'Intent detected');
      }

      // Route to appropriate agent
      let response: string;
      switch (session.currentIntent) {
        case 'lead':
          response = await this.leadAgent.respond(session, userInput);
          break;
        case 'booking':
          response = await this.bookingAgent.respond(session, userInput);
          break;
        case 'menu':
          response = await this.menuAgent.respond(session, userInput);
          break;
        default:
          response = await this.handleUnknownIntent(session, userInput);
      }

      logger.debug({
        callId: session.callId,
        intent: session.currentIntent,
        responseLength: response.length,
      }, 'Agent response generated');

      return response;

    } catch (error) {
      logger.error({
        error,
        callId: session.callId,
        userInput: userInput.substring(0, 100),
      }, 'Agent processing failed');

      return "I apologize, but I'm having trouble processing your request right now. Could you please repeat what you need help with?";
    }
  }

  /**
   * Detect intent from conversation context
   */
  private async detectIntent(session: ExtendedSession, userInput: string): Promise<Intent> {
    const input = userInput.toLowerCase();
    
    // Keyword-based intent detection
    const bookingKeywords = [
      'reservation', 'reserve', 'book', 'table', 'dinner', 'lunch', 
      'party', 'tonight', 'tomorrow', 'date', 'time', 'seat'
    ];
    
    const menuKeywords = [
      'menu', 'food', 'eat', 'dish', 'special', 'what do you have',
      'appetizer', 'entree', 'dessert', 'drink', 'wine', 'price'
    ];
    
    const leadKeywords = [
      'information', 'details', 'tell me about', 'learn more',
      'contact', 'email', 'call back', 'interested'
    ];

    // Count keyword matches
    const bookingScore = bookingKeywords.filter(kw => input.includes(kw)).length;
    const menuScore = menuKeywords.filter(kw => input.includes(kw)).length;
    const leadScore = leadKeywords.filter(kw => input.includes(kw)).length;

    // Use confidence scores from selectors as secondary signal
    const confidence = getIntentConfidence(session);
    
    // Combine keyword scores with confidence
    const finalBookingScore = bookingScore + confidence.booking * 2;
    const finalMenuScore = menuScore + confidence.menu * 2;
    const finalLeadScore = leadScore + confidence.lead * 2;

    // Determine highest scoring intent
    if (finalBookingScore > finalMenuScore && finalBookingScore > finalLeadScore) {
      return 'booking';
    } else if (finalMenuScore > finalLeadScore) {
      return 'menu';
    } else {
      return 'lead'; // Default to lead capture if unclear
    }
  }

  /**
   * Handle cases where intent is unclear
   */
  private async handleUnknownIntent(session: ExtendedSession, userInput: string): Promise<string> {
    logger.warn({
      callId: session.callId,
      userInput: userInput.substring(0, 100),
    }, 'Unknown intent, providing clarification');

    return "I'd be happy to help you! I can assist with making a reservation, telling you about our menu and specials, or providing general information about our restaurant. What would you like to know more about?";
  }

  /**
   * Get initial greeting based on context
   */
  getInitialGreeting(): string {
    const greetings = [
      "Hello! Thanks for calling. How can I help you today?",
      "Hi there! What can I do for you?",
      "Good day! How may I assist you?",
    ];

    // Simple random selection for now
    return greetings[Math.floor(Math.random() * greetings.length)];
  }

  /**
   * Switch intent during conversation
   */
  async switchIntent(session: ExtendedSession, newIntent: Intent, userInput: string): Promise<string> {
    const oldIntent = session.currentIntent;
    session.currentIntent = newIntent;
    session.lastIntent = oldIntent;

    logger.info({
      callId: session.callId,
      oldIntent,
      newIntent,
    }, 'Intent switched');

    // Acknowledge the switch and hand off to new agent
    const acknowledgment = this.getIntentSwitchAcknowledment(oldIntent, newIntent);
    const response = await this.processMessage(session, userInput);

    return `${acknowledgment} ${response}`;
  }

  /**
   * Get acknowledgment message for intent switches
   */
  private getIntentSwitchAcknowledment(oldIntent?: Intent, newIntent?: Intent): string {
    if (!oldIntent) return '';

    switch (newIntent) {
      case 'booking':
        return "Of course, let me help you with a reservation.";
      case 'menu':
        return "Absolutely! I'd love to tell you about our menu.";
      case 'lead':
        return "Sure, I can get you that information.";
      default:
        return "Let me help you with that.";
    }
  }

  /**
   * Get available agents info
   */
  getAgentsInfo() {
    return {
      lead: this.leadAgent.getInfo(),
      booking: this.bookingAgent.getInfo(),
      menu: this.menuAgent.getInfo(),
    };
  }
}

// Export singleton instance
export const agentRouter = new AgentRouter();
