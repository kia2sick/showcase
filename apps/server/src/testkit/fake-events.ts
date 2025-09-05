import { v4 as uuidv4 } from 'uuid';

/**
 * Fake event scenarios for testing the voice agent
 */

export interface SimulationScenario {
  name: string;
  description: string;
  callId: string;
  customerInfo: {
    name: string;
    phone: string;
    email?: string;
  };
  interactions: SimulationInteraction[];
}

export interface SimulationInteraction {
  type: 'caller_speech' | 'agent_response' | 'pause' | 'system_event';
  text?: string;
  audioFile?: string;
  duration?: number; // in milliseconds
  metadata?: any;
}

/**
 * Lead capture scenario
 */
export const LEAD_CAPTURE_SCENARIO: SimulationScenario = {
  name: 'lead-capture',
  description: 'Customer calling for general information and lead capture',
  callId: uuidv4(),
  customerInfo: {
    name: 'Sarah Johnson',
    phone: '+1-555-0123',
    email: 'sarah.johnson@email.com',
  },
  interactions: [
    {
      type: 'system_event',
      text: 'Call started',
      metadata: { event: 'call.started' },
    },
    {
      type: 'agent_response',
      text: 'Hello! Thanks for calling. How can I help you today?',
    },
    {
      type: 'pause',
      duration: 1000,
    },
    {
      type: 'caller_speech',
      text: 'Hi there! I heard about your restaurant and wanted to learn more about what you offer.',
      audioFile: 'hello-restaurant.wav',
    },
    {
      type: 'pause',
      duration: 500,
    },
    {
      type: 'caller_speech',
      text: "I'm interested in maybe hosting an event there.",
    },
    {
      type: 'pause',
      duration: 800,
    },
    {
      type: 'caller_speech',
      text: 'My name is Sarah Johnson.',
    },
    {
      type: 'pause',
      duration: 600,
    },
    {
      type: 'caller_speech',
      text: 'My email is sarah.johnson@email.com',
    },
    {
      type: 'pause',
      duration: 500,
    },
    {
      type: 'caller_speech',
      text: 'Yes, that sounds perfect. Thank you!',
    },
    {
      type: 'system_event',
      text: 'Call ended',
      metadata: { event: 'call.ended', reason: 'completed' },
    },
  ],
};

/**
 * Table booking scenario
 */
export const TABLE_BOOKING_SCENARIO: SimulationScenario = {
  name: 'table-booking',
  description: 'Customer making a dinner reservation with one availability retry',
  callId: uuidv4(),
  customerInfo: {
    name: 'Michael Chen',
    phone: '+1-555-0456',
  },
  interactions: [
    {
      type: 'system_event',
      text: 'Call started',
      metadata: { event: 'call.started' },
    },
    {
      type: 'agent_response',
      text: 'Good evening! How can I assist you today?',
    },
    {
      type: 'pause',
      duration: 800,
    },
    {
      type: 'caller_speech',
      text: "I'd like to make a reservation for dinner tonight.",
      audioFile: 'book-table.wav',
    },
    {
      type: 'pause',
      duration: 600,
    },
    {
      type: 'caller_speech',
      text: 'For two people at 7 PM.',
    },
    {
      type: 'pause',
      duration: 1200, // Simulate checking availability
    },
    {
      type: 'caller_speech',
      text: 'Oh, how about 7:30 PM then?',
    },
    {
      type: 'pause',
      duration: 500,
    },
    {
      type: 'caller_speech',
      text: 'Michael Chen',
    },
    {
      type: 'pause',
      duration: 400,
    },
    {
      type: 'caller_speech',
      text: 'Yes, that all sounds correct.',
    },
    {
      type: 'pause',
      duration: 300,
    },
    {
      type: 'caller_speech',
      text: 'Perfect, thank you so much!',
    },
    {
      type: 'system_event',
      text: 'Call ended',
      metadata: { event: 'call.ended', reason: 'completed' },
    },
  ],
};

/**
 * Menu inquiry scenario
 */
export const MENU_INQUIRY_SCENARIO: SimulationScenario = {
  name: 'menu-inquiry',
  description: 'Customer asking about menu items and specials',
  callId: uuidv4(),
  customerInfo: {
    name: 'Jessica Martinez',
    phone: '+1-555-0789',
  },
  interactions: [
    {
      type: 'system_event',
      text: 'Call started',
      metadata: { event: 'call.started' },
    },
    {
      type: 'agent_response',
      text: 'Hi! Thanks for calling. What can I help you with?',
    },
    {
      type: 'pause',
      duration: 700,
    },
    {
      type: 'caller_speech',
      text: "Hi! I'm thinking about coming in for dinner and wanted to hear about your menu.",
    },
    {
      type: 'pause',
      duration: 900,
    },
    {
      type: 'caller_speech',
      text: "What are today's specials?",
    },
    {
      type: 'pause',
      duration: 1500, // Time for menu description
    },
    {
      type: 'caller_speech',
      text: 'That duck sounds amazing! Do you have any vegetarian options?',
    },
    {
      type: 'pause',
      duration: 1200,
    },
    {
      type: 'caller_speech',
      text: 'Could you repeat the specials again?',
    },
    {
      type: 'pause',
      duration: 1000,
    },
    {
      type: 'caller_speech',
      text: 'Perfect! I think I know what I want. Thank you!',
    },
    {
      type: 'system_event',
      text: 'Call ended',
      metadata: { event: 'call.ended', reason: 'completed' },
    },
  ],
};

/**
 * Complex scenario with intent switching
 */
export const COMPLEX_SCENARIO: SimulationScenario = {
  name: 'complex-interaction',
  description: 'Customer asking about menu, then making reservation, with some clarifications',
  callId: uuidv4(),
  customerInfo: {
    name: 'David Thompson',
    phone: '+1-555-0321',
    email: 'david.t@email.com',
  },
  interactions: [
    {
      type: 'system_event',
      text: 'Call started',
      metadata: { event: 'call.started' },
    },
    {
      type: 'agent_response',
      text: 'Hello! How may I help you today?',
    },
    {
      type: 'pause',
      duration: 600,
    },
    {
      type: 'caller_speech',
      text: 'Hi, can you tell me about your dinner menu?',
    },
    {
      type: 'pause',
      duration: 1200,
    },
    {
      type: 'caller_speech',
      text: 'That sounds great! Actually, can I also make a reservation?',
    },
    {
      type: 'pause',
      duration: 500,
    },
    {
      type: 'caller_speech',
      text: 'Tomorrow night at 6:30 for four people.',
    },
    {
      type: 'pause',
      duration: 800,
    },
    {
      type: 'caller_speech',
      text: 'David Thompson',
    },
    {
      type: 'pause',
      duration: 400,
    },
    {
      type: 'caller_speech',
      text: 'Could you speak a bit slower please?',
    },
    {
      type: 'pause',
      duration: 700,
    },
    {
      type: 'caller_speech',
      text: 'Yes, that all sounds perfect!',
    },
    {
      type: 'pause',
      duration: 300,
    },
    {
      type: 'caller_speech',
      text: 'Thank you so much!',
    },
    {
      type: 'system_event',
      text: 'Call ended',
      metadata: { event: 'call.ended', reason: 'completed' },
    },
  ],
};

/**
 * Get all available scenarios
 */
export const ALL_SCENARIOS = {
  'lead-capture': LEAD_CAPTURE_SCENARIO,
  'table-booking': TABLE_BOOKING_SCENARIO,
  'menu-inquiry': MENU_INQUIRY_SCENARIO,
  'complex-interaction': COMPLEX_SCENARIO,
};

/**
 * Get scenario by name
 */
export function getScenario(name: string): SimulationScenario | null {
  return ALL_SCENARIOS[name as keyof typeof ALL_SCENARIOS] || null;
}

/**
 * List all available scenarios
 */
export function listScenarios(): Array<{ name: string; description: string }> {
  return Object.values(ALL_SCENARIOS).map(scenario => ({
    name: scenario.name,
    description: scenario.description,
  }));
}
