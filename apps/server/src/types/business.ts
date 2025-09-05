import { z } from 'zod';

/**
 * Multi-tenant business management types
 * Each business gets their own voice AI configuration
 */

export const BusinessSchema = z.object({
  id: z.string(),
  name: z.string(),
  industry: z.enum(['restaurant', 'healthcare', 'retail', 'real_estate', 'automotive', 'other']),
  plan: z.enum(['starter', 'professional', 'enterprise']),
  status: z.enum(['active', 'suspended', 'trial']),
  createdAt: z.number(),
  updatedAt: z.number(),
  
  // Contact info
  contact: z.object({
    email: z.string().email(),
    phone: z.string(),
    name: z.string(),
    company: z.string(),
  }),
  
  // Voice AI Configuration
  voiceConfig: z.object({
    primaryIntent: z.enum(['lead_capture', 'booking', 'support', 'sales']),
    businessHours: z.object({
      timezone: z.string().default('America/New_York'),
      monday: z.object({ open: z.string(), close: z.string() }).optional(),
      tuesday: z.object({ open: z.string(), close: z.string() }).optional(),
      wednesday: z.object({ open: z.string(), close: z.string() }).optional(),
      thursday: z.object({ open: z.string(), close: z.string() }).optional(),
      friday: z.object({ open: z.string(), close: z.string() }).optional(),
      saturday: z.object({ open: z.string(), close: z.string() }).optional(),
      sunday: z.object({ open: z.string(), close: z.string() }).optional(),
    }),
    customPrompts: z.object({
      greeting: z.string().optional(),
      businessInfo: z.string(),
      specialInstructions: z.string().optional(),
    }),
    voice: z.object({
      provider: z.enum(['elevenlabs', 'azure', 'meta']).default('elevenlabs'),
      voiceId: z.string().optional(),
      speed: z.number().min(0.5).max(2.0).default(1.0),
      tone: z.enum(['professional', 'friendly', 'energetic', 'calm']).default('friendly'),
    }),
  }),
  
  // Phone numbers assigned to this business
  phoneNumbers: z.array(z.object({
    number: z.string(), // E.164 format
    provider: z.enum(['vapi', 'twilio', 'other']).default('vapi'),
    vapiAssistantId: z.string().optional(),
    isActive: z.boolean().default(true),
    assignedAt: z.number(),
  })),
  
  // CRM Integration
  integrations: z.object({
    hubspot: z.object({
      enabled: z.boolean().default(false),
      apiKey: z.string().optional(),
      pipelineId: z.string().optional(),
    }).optional(),
    airtable: z.object({
      enabled: z.boolean().default(false),
      apiKey: z.string().optional(),
      baseId: z.string().optional(),
      tableId: z.string().optional(),
    }).optional(),
    salesforce: z.object({
      enabled: z.boolean().default(false),
      clientId: z.string().optional(),
      clientSecret: z.string().optional(),
    }).optional(),
  }),
  
  // Usage and billing
  usage: z.object({
    currentMonth: z.object({
      totalCalls: z.number().default(0),
      totalMinutes: z.number().default(0),
      successfulLeads: z.number().default(0),
      cost: z.number().default(0),
    }),
    limits: z.object({
      maxCalls: z.number().default(1000),
      maxMinutes: z.number().default(5000),
      maxPhoneNumbers: z.number().default(1),
    }),
  }),
});

export type Business = z.infer<typeof BusinessSchema>;

export const BusinessCreateSchema = BusinessSchema.omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true,
  usage: true,
  phoneNumbers: true,
});

export type BusinessCreate = z.infer<typeof BusinessCreateSchema>;

// Session with business context
export const BusinessSessionSchema = z.object({
  businessId: z.string(),
  callId: z.string(),
  phoneNumber: z.string(),
  customerPhone: z.string(),
  startTime: z.number(),
  endTime: z.number().optional(),
  intent: z.enum(['lead_capture', 'booking', 'support', 'sales']).optional(),
  outcome: z.enum(['completed', 'abandoned', 'transferred', 'failed']).optional(),
  duration: z.number().optional(),
  cost: z.number().optional(),
  leadCaptured: z.boolean().default(false),
  bookingMade: z.boolean().default(false),
  crmSynced: z.boolean().default(false),
  transcript: z.array(z.object({
    who: z.enum(['caller', 'agent']),
    text: z.string(),
    timestamp: z.number(),
    confidence: z.number().optional(),
  })),
  collectedData: z.record(z.any()),
});

export type BusinessSession = z.infer<typeof BusinessSessionSchema>;
