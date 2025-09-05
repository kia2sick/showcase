import { z } from 'zod';

// Base event schema
export const VapiEventSchema = z.object({
  type: z.string(),
  callId: z.string(),
  timestamp: z.string().optional(),
});

// Call started event
export const CallStartedEventSchema = VapiEventSchema.extend({
  type: z.literal('call.started'),
  call: z.object({
    id: z.string(),
    phoneNumber: z.string().optional(),
    customer: z.object({
      number: z.string().optional(),
      name: z.string().optional(),
    }).optional(),
    assistantId: z.string().optional(),
    metadata: z.record(z.any()).optional(),
  }),
});

// Call ended event
export const CallEndedEventSchema = VapiEventSchema.extend({
  type: z.literal('call.ended'),
  call: z.object({
    id: z.string(),
    duration: z.number().optional(),
    endedReason: z.string().optional(),
    cost: z.number().optional(),
  }),
});

// ASR (Automatic Speech Recognition) events
export const ASRPartialEventSchema = VapiEventSchema.extend({
  type: z.literal('asr.partial'),
  transcript: z.string(),
  confidence: z.number().optional(),
});

export const ASRFinalEventSchema = VapiEventSchema.extend({
  type: z.literal('asr.final'),
  transcript: z.string(),
  confidence: z.number().optional(),
});

// Function call events
export const FunctionCallEventSchema = VapiEventSchema.extend({
  type: z.literal('function.call'),
  functionCall: z.object({
    name: z.string(),
    parameters: z.record(z.any()),
  }),
});

// Union of all event types
export const VapiWebhookEventSchema = z.discriminatedUnion('type', [
  CallStartedEventSchema,
  CallEndedEventSchema,
  ASRPartialEventSchema,
  ASRFinalEventSchema,
  FunctionCallEventSchema,
]);

// TypeScript types
export type VapiEvent = z.infer<typeof VapiEventSchema>;
export type CallStartedEvent = z.infer<typeof CallStartedEventSchema>;
export type CallEndedEvent = z.infer<typeof CallEndedEventSchema>;
export type ASRPartialEvent = z.infer<typeof ASRPartialEventSchema>;
export type ASRFinalEvent = z.infer<typeof ASRFinalEventSchema>;
export type FunctionCallEvent = z.infer<typeof FunctionCallEventSchema>;
export type VapiWebhookEvent = z.infer<typeof VapiWebhookEventSchema>;

// Outbound call request schema
export const OutboundCallRequestSchema = z.object({
  assistantId: z.string(),
  phoneNumber: z.string(),
  customer: z.object({
    number: z.string(),
    name: z.string().optional(),
  }),
  metadata: z.record(z.any()).optional(),
});

export type OutboundCallRequest = z.infer<typeof OutboundCallRequestSchema>;
