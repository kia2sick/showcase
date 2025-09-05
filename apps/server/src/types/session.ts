import { z } from 'zod';

// Intent types
export const IntentSchema = z.enum(['lead', 'booking', 'menu']);
export type Intent = z.infer<typeof IntentSchema>;

// Transcript entry
export const TranscriptEntrySchema = z.object({
  who: z.enum(['caller', 'agent']),
  text: z.string(),
  timestamp: z.number(),
  confidence: z.number().optional(),
});

export type TranscriptEntry = z.infer<typeof TranscriptEntrySchema>;

// Collected data during call
export const CollectedDataSchema = z.object({
  name: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  partySize: z.number().int().positive().optional(),
  dateTime: z.string().optional(),
  useCase: z.string().optional(),
  specialRequests: z.string().optional(),
});

export type CollectedData = z.infer<typeof CollectedDataSchema>;

// Session state
export const SessionStateSchema = z.object({
  callId: z.string(),
  createdAt: z.number(),
  lastActivity: z.number(),
  currentIntent: IntentSchema.optional(),
  lastIntent: IntentSchema.optional(),
  collected: CollectedDataSchema,
  lastMenuRead: z.array(z.string()).optional(),
  transcript: z.array(TranscriptEntrySchema),
  metadata: z.record(z.any()).optional(),
  isActive: z.boolean().default(true),
});

export type SessionState = z.infer<typeof SessionStateSchema>;

// CRM action tracking
export const CRMActionSchema = z.object({
  type: z.enum(['hubspot_contact', 'airtable_reservation', 'hubspot_deal']),
  status: z.enum(['pending', 'success', 'failed']),
  timestamp: z.number(),
  data: z.record(z.any()),
  error: z.string().optional(),
  idempotencyKey: z.string(),
});

export type CRMAction = z.infer<typeof CRMActionSchema>;

// Extended session with CRM tracking
export const ExtendedSessionSchema = SessionStateSchema.extend({
  crmActions: z.array(CRMActionSchema).default([]),
});

export type ExtendedSession = z.infer<typeof ExtendedSessionSchema>;
