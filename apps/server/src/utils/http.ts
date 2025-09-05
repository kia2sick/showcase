import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { logger } from './logger.js';

const httpLogger = logger.child({ component: 'http' });

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  jitter: boolean;
}

const defaultRetryConfig: RetryConfig = {
  maxRetries: 2,
  baseDelay: 1000,
  maxDelay: 10000,
  jitter: true,
};

/**
 * Calculate delay with exponential backoff and optional jitter
 */
function calculateDelay(attempt: number, config: RetryConfig): number {
  const exponentialDelay = Math.min(
    config.baseDelay * Math.pow(2, attempt),
    config.maxDelay
  );

  if (config.jitter) {
    // Add random jitter (±25%)
    const jitterRange = exponentialDelay * 0.25;
    const jitter = (Math.random() - 0.5) * 2 * jitterRange;
    return Math.max(0, exponentialDelay + jitter);
  }

  return exponentialDelay;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if error is retryable
 */
function isRetryableError(error: any): boolean {
  if (!error.response) {
    // Network errors are retryable
    return true;
  }

  const status = error.response.status;
  // Retry on server errors and rate limits
  return status >= 500 || status === 429;
}

/**
 * Create HTTP client with retry logic and timeouts
 */
export function createHttpClient(baseConfig: AxiosRequestConfig = {}): AxiosInstance {
  const client = axios.create({
    timeout: 10000, // 10s default timeout
    ...baseConfig,
  });

  // Request interceptor for logging
  client.interceptors.request.use(
    (config) => {
      httpLogger.debug({
        method: config.method?.toUpperCase(),
        url: config.url,
        headers: config.headers,
      }, 'HTTP request');
      return config;
    },
    (error) => {
      httpLogger.error({ error }, 'HTTP request error');
      return Promise.reject(error);
    }
  );

  // Response interceptor for logging
  client.interceptors.response.use(
    (response) => {
      httpLogger.debug({
        status: response.status,
        url: response.config.url,
        duration: response.headers['x-response-time'],
      }, 'HTTP response');
      return response;
    },
    (error) => {
      httpLogger.error({
        status: error.response?.status,
        url: error.config?.url,
        message: error.message,
      }, 'HTTP response error');
      return Promise.reject(error);
    }
  );

  return client;
}

/**
 * Make HTTP request with retry logic
 */
export async function httpWithRetry<T>(
  client: AxiosInstance,
  config: AxiosRequestConfig,
  retryConfig: RetryConfig = defaultRetryConfig
): Promise<AxiosResponse<T>> {
  let lastError: any;

  for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
    try {
      const response = await client.request<T>(config);
      
      if (attempt > 0) {
        httpLogger.info({
          attempt,
          url: config.url,
          method: config.method,
        }, 'HTTP request succeeded after retry');
      }

      return response;
    } catch (error) {
      lastError = error;

      if (attempt === retryConfig.maxRetries || !isRetryableError(error)) {
        break;
      }

      const delay = calculateDelay(attempt, retryConfig);
      
      httpLogger.warn({
        attempt: attempt + 1,
        maxRetries: retryConfig.maxRetries,
        delay,
        error: error.message,
        url: config.url,
      }, 'HTTP request failed, retrying');

      await sleep(delay);
    }
  }

  httpLogger.error({
    url: config.url,
    method: config.method,
    attempts: retryConfig.maxRetries + 1,
    error: lastError.message,
  }, 'HTTP request failed after all retries');

  throw lastError;
}

// Pre-configured clients for different services
export const defaultHttpClient = createHttpClient();

export const openaiClient = createHttpClient({
  baseURL: 'https://api.openai.com/v1',
  timeout: 30000, // 30s for STT/TTS
});

export const deepgramClient = createHttpClient({
  baseURL: 'https://api.deepgram.com/v1',
  timeout: 30000,
});

export const elevenlabsClient = createHttpClient({
  baseURL: 'https://api.elevenlabs.io/v1',
  timeout: 30000,
});

export const hubspotClient = createHttpClient({
  baseURL: 'https://api.hubapi.com',
  timeout: 15000,
});

export const airtableClient = createHttpClient({
  baseURL: 'https://api.airtable.com/v0',
  timeout: 15000,
});

export const vapiClient = createHttpClient({
  baseURL: 'https://api.vapi.ai',
  timeout: 15000,
});
