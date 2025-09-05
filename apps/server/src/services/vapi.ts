import { OutboundCallRequest } from '../types/vapi.js';
import { vapiClient, httpWithRetry } from '../utils/http.js';
import { config } from '../utils/env.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('vapi');

/**
 * Vapi Service
 * Handles outbound calls and assistant management
 */
export class VapiService {
  private readonly apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || config.VAPI_API_KEY || '';
    
    if (!this.apiKey) {
      logger.warn('Vapi API key not configured, outbound calling will be disabled');
    } else {
      logger.info('Vapi service initialized');
    }
  }

  /**
   * Create an outbound call
   */
  async createOutboundCall(request: OutboundCallRequest): Promise<any> {
    if (!this.apiKey) {
      throw new Error('Vapi API key not configured');
    }

    try {
      logger.debug({ 
        assistantId: request.assistantId,
        phoneNumber: request.phoneNumber,
        customer: request.customer,
      }, 'Starting Vapi outbound call');

      const response = await httpWithRetry(vapiClient, {
        method: 'POST',
        url: '/call', // Vapi outbound call endpoint
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        data: {
          assistant: {
            id: request.assistantId,
          },
          phoneNumber: request.phoneNumber,
          customer: request.customer,
          metadata: request.metadata || {},
        },
      });

      logger.info({ 
        callId: response.data.id,
        phoneNumber: request.phoneNumber,
      }, 'Vapi outbound call created');

      return response.data;

    } catch (error: any) {
      logger.error({
        error: error.message,
        status: error.response?.status,
        phoneNumber: request.phoneNumber,
      }, 'Vapi outbound call failed');

      throw new Error(`Vapi outbound call failed: ${error.message}`);
    }
  }

  /**
   * Get call details
   */
  async getCall(callId: string): Promise<any> {
    if (!this.apiKey) {
      throw new Error('Vapi API key not configured');
    }

    try {
      const response = await httpWithRetry(vapiClient, {
        method: 'GET',
        url: `/call/${callId}`,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      return response.data;

    } catch (error: any) {
      logger.error({
        error: error.message,
        status: error.response?.status,
        callId,
      }, 'Failed to get Vapi call details');

      throw new Error(`Failed to get call details: ${error.message}`);
    }
  }

  /**
   * List calls
   */
  async listCalls(options: {
    limit?: number;
    offset?: number;
    assistantId?: string;
  } = {}): Promise<any> {
    if (!this.apiKey) {
      throw new Error('Vapi API key not configured');
    }

    try {
      const params = new URLSearchParams();
      
      if (options.limit) params.append('limit', options.limit.toString());
      if (options.offset) params.append('offset', options.offset.toString());
      if (options.assistantId) params.append('assistantId', options.assistantId);

      const response = await httpWithRetry(vapiClient, {
        method: 'GET',
        url: `/call?${params.toString()}`,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      return response.data;

    } catch (error: any) {
      logger.error({
        error: error.message,
        status: error.response?.status,
      }, 'Failed to list Vapi calls');

      return { calls: [] };
    }
  }

  /**
   * Get assistant details
   */
  async getAssistant(assistantId: string): Promise<any> {
    if (!this.apiKey) {
      throw new Error('Vapi API key not configured');
    }

    try {
      const response = await httpWithRetry(vapiClient, {
        method: 'GET',
        url: `/assistant/${assistantId}`,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      return response.data;

    } catch (error: any) {
      logger.error({
        error: error.message,
        status: error.response?.status,
        assistantId,
      }, 'Failed to get Vapi assistant details');

      return null;
    }
  }

  /**
   * List assistants
   */
  async listAssistants(): Promise<any> {
    if (!this.apiKey) {
      throw new Error('Vapi API key not configured');
    }

    try {
      const response = await httpWithRetry(vapiClient, {
        method: 'GET',
        url: '/assistant',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      return response.data;

    } catch (error: any) {
      logger.error({
        error: error.message,
        status: error.response?.status,
      }, 'Failed to list Vapi assistants');

      return { assistants: [] };
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    if (!this.apiKey) {
      return false;
    }

    try {
      // Try to list assistants as a health check
      await this.listAssistants();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if service is configured
   */
  isConfigured(): boolean {
    return !!this.apiKey;
  }

  /**
   * Check if outbound calling is enabled and configured
   */
  isOutboundEnabled(): boolean {
    return !!(
      config.VAPI_OUTBOUND_ENABLED &&
      this.apiKey &&
      config.VAPI_ASSISTANT_ID &&
      config.VAPI_CALLER_NUMBER &&
      config.VAPI_CALLEE_NUMBER
    );
  }

  /**
   * Get service info
   */
  getServiceInfo() {
    return {
      provider: 'vapi',
      configured: this.isConfigured(),
      outboundEnabled: this.isOutboundEnabled(),
      features: ['outbound_calls', 'call_management', 'assistant_management'],
    };
  }
}

// Singleton instance
export const vapiService = new VapiService();
