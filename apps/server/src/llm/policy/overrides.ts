import { ExtendedSession } from '../types/session.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('policy');

/**
 * Policy override system for handling specific conversation triggers
 * These override normal agent behavior for specific situations
 */

export interface PolicyOverride {
  trigger: string | RegExp;
  priority: number;
  handler: (session: ExtendedSession, userInput: string) => string | null;
  description: string;
}

/**
 * Built-in policy overrides
 */
export const POLICY_OVERRIDES: PolicyOverride[] = [
  // Availability and business hours
  {
    trigger: /not available|closed|unavailable/i,
    priority: 10,
    description: 'Handle unavailability requests',
    handler: (session, userInput) => {
      if (userInput.toLowerCase().includes('time') || userInput.toLowerCase().includes('when')) {
        return "I understand you're asking about availability. Let me check what options I have for you. What date and time were you hoping for?";
      }
      return "I understand that time doesn't work. Let me see what other options I can offer you.";
    },
  },

  // Repeat requests
  {
    trigger: /repeat|say that again|didn't catch|didn't hear/i,
    priority: 9,
    description: 'Handle repeat requests',
    handler: (session, userInput) => {
      if (session.lastMenuRead && session.lastMenuRead.length > 0) {
        const lastMenu = session.lastMenuRead.join('. ');
        return `Of course! Let me repeat that. ${lastMenu}`;
      }
      
      const lastAgentMessage = session.transcript
        .filter(entry => entry.who === 'agent')
        .slice(-1)[0];
        
      if (lastAgentMessage) {
        return `Sure, let me repeat that. ${lastAgentMessage.text}`;
      }
      
      return "I'm sorry, let me start over. How can I help you today?";
    },
  },

  // Speed adjustment requests
  {
    trigger: /speak slower|slow down|too fast/i,
    priority: 8,
    description: 'Handle requests to speak slower',
    handler: (session, userInput) => {
      return "Of course, I'll speak more slowly. Let me repeat that information at a more comfortable pace.";
    },
  },

  {
    trigger: /speak faster|speed up|too slow/i,
    priority: 8,
    description: 'Handle requests to speak faster',
    handler: (session, userInput) => {
      return "Sure, I'll pick up the pace. Let me continue with the information you need.";
    },
  },

  // Spelling requests
  {
    trigger: /spell|spelling|letters/i,
    priority: 7,
    description: 'Handle spelling requests',
    handler: (session, userInput) => {
      if (session.collected.email) {
        const email = session.collected.email;
        const spelled = email.split('').join(' ');
        return `Sure! Your email address is spelled: ${spelled}. Did I get that right?`;
      }
      return "What would you like me to spell for you?";
    },
  },

  // Menu repeat requests
  {
    trigger: /repeat.*menu|menu.*again|last.*menu/i,
    priority: 6,
    description: 'Handle menu repeat requests',
    handler: (session, userInput) => {
      if (session.lastMenuRead && session.lastMenuRead.length > 0) {
        const lastMenu = session.lastMenuRead.join('. ');
        return `Absolutely! Here are those menu items again: ${lastMenu}`;
      }
      return "I haven't shared any specific menu items yet. What would you like to hear about?";
    },
  },

  // Clarification requests
  {
    trigger: /what|huh|excuse me|pardon/i,
    priority: 5,
    description: 'Handle clarification requests',
    handler: (session, userInput) => {
      return "I'm sorry, let me clarify. What specific information can I help you with?";
    },
  },

  // Transfer to human requests
  {
    trigger: /human|person|manager|speak to someone/i,
    priority: 9,
    description: 'Handle requests to speak with a human',
    handler: (session, userInput) => {
      return "I understand you'd like to speak with someone from our team. Let me get your contact information and have someone call you back within the hour. What's the best number to reach you?";
    },
  },

  // Complaint or problem indicators
  {
    trigger: /problem|issue|complaint|wrong|mistake/i,
    priority: 8,
    description: 'Handle complaints or problems',
    handler: (session, userInput) => {
      return "I'm sorry to hear there's an issue. I want to make sure we take care of this properly. Can you tell me more about what happened?";
    },
  },

  // Emergency or urgent requests
  {
    trigger: /emergency|urgent|asap|right now/i,
    priority: 10,
    description: 'Handle urgent requests',
    handler: (session, userInput) => {
      return "I understand this is urgent. Let me help you right away. What do you need assistance with?";
    },
  },

  // Cancellation requests
  {
    trigger: /cancel|remove|delete|don't want/i,
    priority: 7,
    description: 'Handle cancellation requests',
    handler: (session, userInput) => {
      if (session.collected.name || session.collected.email) {
        return "I understand you'd like to cancel. Let me help you with that. Can you provide me with your reservation details or contact information?";
      }
      return "What would you like to cancel? I'm here to help.";
    },
  },
];

/**
 * Check for policy overrides and apply them
 */
export function checkPolicyOverrides(session: ExtendedSession, userInput: string): string | null {
  const cleanInput = userInput.trim().toLowerCase();
  
  // Sort overrides by priority (higher first)
  const sortedOverrides = [...POLICY_OVERRIDES].sort((a, b) => b.priority - a.priority);
  
  for (const override of sortedOverrides) {
    let matches = false;
    
    if (typeof override.trigger === 'string') {
      matches = cleanInput.includes(override.trigger.toLowerCase());
    } else {
      matches = override.trigger.test(userInput);
    }
    
    if (matches) {
      try {
        const response = override.handler(session, userInput);
        if (response) {
          logger.info({
            trigger: override.description,
            userInput: userInput.substring(0, 100),
            callId: session.callId,
          }, 'Policy override applied');
          
          return response;
        }
      } catch (error) {
        logger.error({
          error,
          trigger: override.description,
          callId: session.callId,
        }, 'Policy override handler failed');
      }
    }
  }
  
  return null;
}

/**
 * Add custom policy override
 */
export function addPolicyOverride(override: PolicyOverride): void {
  POLICY_OVERRIDES.push(override);
  logger.info({ description: override.description }, 'Custom policy override added');
}

/**
 * Get all policy overrides
 */
export function getPolicyOverrides(): PolicyOverride[] {
  return [...POLICY_OVERRIDES];
}

/**
 * Check if input matches any high-priority overrides
 */
export function hasHighPriorityOverride(userInput: string): boolean {
  const highPriorityOverrides = POLICY_OVERRIDES.filter(o => o.priority >= 8);
  
  for (const override of highPriorityOverrides) {
    if (typeof override.trigger === 'string') {
      if (userInput.toLowerCase().includes(override.trigger.toLowerCase())) {
        return true;
      }
    } else {
      if (override.trigger.test(userInput)) {
        return true;
      }
    }
  }
  
  return false;
}
