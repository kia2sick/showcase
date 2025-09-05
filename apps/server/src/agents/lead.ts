import { ExtendedSession } from '../types/session.js';
import { hasRequiredData, getMissingFields } from '../memory/selectors.js';
import { sessionStore } from '../memory/session-store.js';
import { hubspotService } from '../services/hubspot.js';
import { agentLogger as logger } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import path from 'path';

/**
 * Lead Capture Agent
 * Focuses on collecting contact information and understanding caller needs
 */
export class LeadAgent {
  private systemPrompt: string = '';

  constructor() {
    this.loadSystemPrompt();
  }

  /**
   * Load system prompt from file
   */
  private async loadSystemPrompt() {
    try {
      const promptPath = path.join(process.cwd(), 'src/llm/system/lead.md');
      this.systemPrompt = await fs.readFile(promptPath, 'utf-8');
    } catch (error) {
      logger.warn('Could not load lead system prompt, using fallback');
      this.systemPrompt = this.getFallbackPrompt();
    }
  }

  /**
   * Generate response for lead capture
   */
  async respond(session: ExtendedSession, userInput: string): Promise<string> {
    logger.debug({
      callId: session.callId,
      collected: session.collected,
      userInput: userInput.substring(0, 100),
    }, 'Lead agent processing input');

    // Check if we have all required data
    if (hasRequiredData(session, 'lead')) {
      return await this.handleCompleteLead(session, userInput);
    }

    // Extract information from user input
    await this.extractInformation(session, userInput);

    // Generate appropriate response based on what we still need
    return this.generateResponse(session, userInput);
  }

  /**
   * Extract information from user input
   */
  private async extractInformation(session: ExtendedSession, userInput: string): Promise<void> {
    const input = userInput.toLowerCase();
    
    // Extract name (simple pattern matching)
    if (!session.collected.name) {
      const namePatterns = [
        /my name is ([a-zA-Z\s]+)/i,
        /i'm ([a-zA-Z\s]+)/i,
        /this is ([a-zA-Z\s]+)/i,
        /call me ([a-zA-Z\s]+)/i,
      ];

      for (const pattern of namePatterns) {
        const match = userInput.match(pattern);
        if (match) {
          const name = match[1].trim();
          if (name.length > 1 && name.length < 50) {
            sessionStore.updateCollected(session.callId, { name });
            logger.debug({ callId: session.callId, name }, 'Extracted name');
            break;
          }
        }
      }
    }

    // Extract email (more robust pattern)
    if (!session.collected.email) {
      const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
      const emailMatch = userInput.match(emailPattern);
      
      if (emailMatch && emailMatch[0]) {
        sessionStore.updateCollected(session.callId, { email: emailMatch[0] });
        logger.debug({ callId: session.callId, email: emailMatch[0] }, 'Extracted email');
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

    // Extract use case or interest
    if (!session.collected.useCase) {
      const useCaseKeywords = [
        'interested in', 'looking for', 'want to know about', 'need information about',
        'thinking about', 'considering', 'planning'
      ];

      for (const keyword of useCaseKeywords) {
        if (input.includes(keyword)) {
          const index = input.indexOf(keyword);
          const useCase = userInput.substring(index + keyword.length).trim();
          if (useCase.length > 5 && useCase.length < 200) {
            sessionStore.updateCollected(session.callId, { useCase });
            logger.debug({ callId: session.callId, useCase }, 'Extracted use case');
            break;
          }
        }
      }
    }
  }

  /**
   * Generate response based on current state
   */
  private generateResponse(session: ExtendedSession, userInput: string): string {
    const missing = getMissingFields(session, 'lead');

    // First interaction - warm greeting
    if (session.transcript.length <= 1) {
      return "Hi there! Thanks for calling. I'd love to help you with whatever you need. What can I do for you today?";
    }

    // Need name
    if (missing.includes('name')) {
      if (userInput.toLowerCase().includes('name')) {
        return "Great! And what's your name?";
      } else {
        return "Perfect! I'd be happy to help with that. Can I get your name first?";
      }
    }

    // Need email
    if (missing.includes('email')) {
      if (session.collected.name) {
        return `Thanks ${session.collected.name}! What's the best email address to reach you at?`;
      } else {
        return "And what's the best email address to reach you at?";
      }
    }

    // Has basic info, gather more context
    if (!session.collected.useCase) {
      return "Excellent! Can you tell me a bit more about what you're interested in or what brought you to call us today?";
    }

    // All required info collected, confirm and close
    return this.generateConfirmationResponse(session);
  }

  /**
   * Handle complete lead (all required data collected)
   */
  private async handleCompleteLead(session: ExtendedSession, userInput: string): Promise<string> {
    // Create HubSpot contact if not already done
    const existingContact = session.crmActions.find(
      action => action.type === 'hubspot_contact' && action.status === 'success'
    );

    if (!existingContact && session.collected.name && session.collected.email) {
      try {
        const idempotencyKey = uuidv4();
        
        // Add pending CRM action
        sessionStore.addCRMAction(session.callId, {
          type: 'hubspot_contact',
          status: 'pending',
          timestamp: Date.now(),
          data: {
            name: session.collected.name,
            email: session.collected.email,
            phone: session.collected.phone,
            useCase: session.collected.useCase,
          },
          idempotencyKey,
        });

        // Create HubSpot contact
        const contactResult = await hubspotService.upsertContact({
          email: session.collected.email,
          firstname: session.collected.name.split(' ')[0],
          lastname: session.collected.name.split(' ').slice(1).join(' ') || '',
          phone: session.collected.phone || '',
          hs_lead_status: 'NEW',
          lifecyclestage: 'lead',
        }, idempotencyKey);

        // Update CRM action status
        sessionStore.updateCRMAction(session.callId, idempotencyKey, {
          status: 'success',
          data: { ...session.crmActions.find(a => a.idempotencyKey === idempotencyKey)?.data, contactResult },
        });

        logger.info({
          callId: session.callId,
          email: session.collected.email,
          contactId: contactResult.id,
        }, 'HubSpot contact created for lead');

      } catch (error) {
        logger.error({
          error,
          callId: session.callId,
          email: session.collected.email,
        }, 'Failed to create HubSpot contact');

        // Update CRM action with failure
        const failedAction = session.crmActions.find(a => a.type === 'hubspot_contact' && a.status === 'pending');
        if (failedAction) {
          sessionStore.updateCRMAction(session.callId, failedAction.idempotencyKey, {
            status: 'failed',
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    }

    // Check if they're asking for something else
    if (this.isNewRequest(userInput)) {
      return "Absolutely! What else can I help you with?";
    }

    // Provide final confirmation and next steps
    return this.generateFinalResponse(session);
  }

  /**
   * Generate confirmation response
   */
  private generateConfirmationResponse(session: ExtendedSession): string {
    const name = session.collected.name;
    const email = session.collected.email;
    
    if (name && email) {
      // Spell out email for confirmation
      const emailSpelled = email.split('').join(' ');
      return `Perfect! Let me confirm I have your information correct. Your name is ${name} and your email is ${email}. That's ${emailSpelled}. Is that right?`;
    }
    
    return "Let me make sure I have everything correct. Can you confirm your details for me?";
  }

  /**
   * Generate final response with next steps
   */
  private generateFinalResponse(session: ExtendedSession): string {
    const name = session.collected.name;
    const useCase = session.collected.useCase;
    
    let response = `Wonderful${name ? `, ${name}` : ''}! I've got your information.`;
    
    if (useCase) {
      response += ` Someone from our team will reach out to you about ${useCase} within 24 hours.`;
    } else {
      response += ` Someone from our team will reach out to you within 24 hours.`;
    }
    
    response += " Is there anything else I can help you with today?";
    
    return response;
  }

  /**
   * Check if user input represents a new request
   */
  private isNewRequest(userInput: string): boolean {
    const newRequestKeywords = [
      'also', 'another', 'else', 'different', 'other', 'more',
      'reservation', 'menu', 'book', 'table'
    ];
    
    const input = userInput.toLowerCase();
    return newRequestKeywords.some(keyword => input.includes(keyword));
  }

  /**
   * Get fallback system prompt
   */
  private getFallbackPrompt(): string {
    return `You are a lead capture agent for a restaurant. Your goal is to collect the caller's name and email address while understanding their needs. Be warm, professional, and conversational.`;
  }

  /**
   * Get agent info
   */
  getInfo() {
    return {
      name: 'Lead Capture Agent',
      intent: 'lead',
      requiredFields: ['name', 'email'],
      optionalFields: ['phone', 'useCase'],
      capabilities: ['contact_collection', 'hubspot_integration', 'needs_assessment'],
    };
  }
}
