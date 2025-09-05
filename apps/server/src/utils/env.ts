import { z } from 'zod';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '../../.env' });

const envSchema = z.object({
  // Server
  PORT: z.string().default('3000').transform(Number),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  BASE_URL: z.string().url().default('http://localhost:3000'),

  // Vapi
  VAPI_API_KEY: z.string().optional(),
  VAPI_WEBHOOK_SECRET: z.string().optional(),
  VAPI_OUTBOUND_ENABLED: z.string().transform(val => val === 'true').default('false'),
  VAPI_ASSISTANT_ID: z.string().optional(),
  VAPI_CALLER_NUMBER: z.string().optional(),
  VAPI_CALLEE_NUMBER: z.string().optional(),

  // STT
  STT_PROVIDER: z.enum(['whisper', 'deepgram']).default('whisper'),
  OPENAI_API_KEY: z.string().optional(),
  DEEPGRAM_API_KEY: z.string().optional(),

  // TTS
  ELEVEN_API_KEY: z.string().optional(),
  ELEVEN_VOICE_ID: z.string().optional(),
  TTS_FALLBACK_PROVIDER: z.enum(['meta', 'azure', 'none']).default('none'),

  // CRM
  HUBSPOT_PRIVATE_APP_TOKEN: z.string().optional(),
  HUBSPOT_PIPELINE_ID: z.string().optional(),
  HUBSPOT_SOURCE: z.string().default('VoiceAgent'),

  // Airtable
  AIRTABLE_API_KEY: z.string().optional(),
  AIRTABLE_BASE_ID: z.string().optional(),
  AIRTABLE_RESERVATIONS_TABLE: z.string().default('Reservations'),
  AIRTABLE_MENU_TABLE: z.string().default('Menu'),

  // Simulation/Testing
  SIM_TRANSCRIPT_SPEED: z.enum(['fast', 'realtime']).default('fast'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('debug'),
});

export type EnvConfig = z.infer<typeof envSchema>;

let config: EnvConfig;

try {
  config = envSchema.parse(process.env);
} catch (error) {
  console.error('❌ Invalid environment configuration:', error);
  process.exit(1);
}

export { config };

// Validation helpers
export const validateSTTConfig = () => {
  if (config.STT_PROVIDER === 'whisper' && !config.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required when STT_PROVIDER is whisper');
  }
  if (config.STT_PROVIDER === 'deepgram' && !config.DEEPGRAM_API_KEY) {
    throw new Error('DEEPGRAM_API_KEY is required when STT_PROVIDER is deepgram');
  }
};

export const validateTTSConfig = () => {
  if (!config.ELEVEN_API_KEY) {
    console.warn('⚠️  ELEVEN_API_KEY not set, TTS will use fallback');
  }
};

export const validateCRMConfig = () => {
  if (!config.HUBSPOT_PRIVATE_APP_TOKEN) {
    console.warn('⚠️  HUBSPOT_PRIVATE_APP_TOKEN not set, HubSpot integration disabled');
  }
  if (!config.AIRTABLE_API_KEY || !config.AIRTABLE_BASE_ID) {
    console.warn('⚠️  Airtable credentials not set, Airtable integration disabled');
  }
};

export const validateOutboundConfig = () => {
  if (config.VAPI_OUTBOUND_ENABLED) {
    const required = ['VAPI_API_KEY', 'VAPI_ASSISTANT_ID', 'VAPI_CALLER_NUMBER', 'VAPI_CALLEE_NUMBER'];
    const missing = required.filter(key => !config[key as keyof EnvConfig]);
    
    if (missing.length > 0) {
      throw new Error(`Outbound calling enabled but missing: ${missing.join(', ')}`);
    }
  }
};
