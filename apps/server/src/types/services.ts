import { z } from 'zod';

// STT Service Types
export interface STTService {
  transcribeBuffer(audioBuffer: Buffer, options?: STTOptions): Promise<STTResult>;
  startStreaming?(options?: STTOptions): STTStreamingSession;
}

export interface STTOptions {
  language?: string;
  model?: string;
  sampleRate?: number;
}

export interface STTResult {
  text: string;
  confidence: number;
  language?: string;
  duration?: number;
}

export interface STTStreamingSession {
  sendAudio(chunk: Buffer): void;
  stop(): void;
  on(event: 'transcript', listener: (result: STTResult) => void): void;
  on(event: 'error', listener: (error: Error) => void): void;
  on(event: 'close', listener: () => void): void;
}

// TTS Service Types
export interface TTSService {
  synthesize(text: string, options?: TTSOptions): Promise<TTSResult>;
}

export interface TTSOptions {
  voiceId?: string;
  speed?: number;
  pitch?: number;
  format?: 'mp3' | 'wav' | 'ogg';
}

export interface TTSResult {
  audio: Buffer;
  format: string;
  duration?: number;
}

// HubSpot Types
export const HubSpotContactSchema = z.object({
  email: z.string().email(),
  firstname: z.string().optional(),
  lastname: z.string().optional(),
  phone: z.string().optional(),
  hs_lead_status: z.string().optional(),
  lifecyclestage: z.string().optional(),
  source: z.string().optional(),
});

export type HubSpotContact = z.infer<typeof HubSpotContactSchema>;

export const HubSpotDealSchema = z.object({
  dealname: z.string(),
  amount: z.number().optional(),
  dealstage: z.string().optional(),
  pipeline: z.string().optional(),
  closedate: z.string().optional(),
  source: z.string().optional(),
});

export type HubSpotDeal = z.infer<typeof HubSpotDealSchema>;

// Airtable Types
export const AirtableReservationSchema = z.object({
  Name: z.string(),
  Email: z.string().email().optional(),
  Phone: z.string().optional(),
  'Party Size': z.number().int().positive(),
  'Date & Time': z.string(),
  'Special Requests': z.string().optional(),
  Status: z.enum(['Confirmed', 'Pending', 'Cancelled']).default('Confirmed'),
  Source: z.string().default('Voice Agent'),
  'Created At': z.string().optional(),
});

export type AirtableReservation = z.infer<typeof AirtableReservationSchema>;

export const AirtableMenuItemSchema = z.object({
  Name: z.string(),
  Description: z.string().optional(),
  Price: z.number().optional(),
  Category: z.string().optional(),
  Available: z.boolean().default(true),
  'Dietary Notes': z.string().optional(),
});

export type AirtableMenuItem = z.infer<typeof AirtableMenuItemSchema>;

// Availability Types
export const TimeSlotSchema = z.object({
  time: z.string(), // HH:MM format
  available: z.boolean(),
  maxPartySize: z.number().int().positive().default(8),
  remainingSlots: z.number().int().nonnegative().default(1),
});

export type TimeSlot = z.infer<typeof TimeSlotSchema>;

export const DayAvailabilitySchema = z.object({
  date: z.string(), // YYYY-MM-DD format
  slots: z.array(TimeSlotSchema),
  isOpen: z.boolean().default(true),
  specialNotes: z.string().optional(),
});

export type DayAvailability = z.infer<typeof DayAvailabilitySchema>;
