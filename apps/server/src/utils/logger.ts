import pino from 'pino';
import { config } from './env.js';

const isDevelopment = config.NODE_ENV === 'development';

export const logger = pino({
  level: config.LOG_LEVEL,
  transport: isDevelopment
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          ignore: 'pid,hostname',
          translateTime: 'SYS:standard',
        },
      }
    : undefined,
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
});

// Create child loggers for different components
export const createLogger = (component: string) => {
  return logger.child({ component });
};

// Specific loggers for different parts of the system
export const serverLogger = createLogger('server');
export const webhookLogger = createLogger('webhook');
export const agentLogger = createLogger('agent');
export const sttLogger = createLogger('stt');
export const ttsLogger = createLogger('tts');
export const crmLogger = createLogger('crm');
export const simLogger = createLogger('simulator');
