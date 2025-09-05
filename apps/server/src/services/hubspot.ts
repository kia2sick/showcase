import { v4 as uuidv4 } from 'uuid';
import { HubSpotContact, HubSpotDeal } from '../types/services.js';
import { hubspotClient, httpWithRetry } from '../utils/http.js';
import { config } from '../utils/env.js';
import { crmLogger as logger } from '../utils/logger.js';
import { forLogging } from '../utils/redact.js';

/**
 * HubSpot CRM Service
 * Handles contact and deal management with idempotency
 */
export class HubSpotService {
  private readonly apiToken: string;
  private readonly source: string;

  constructor(apiToken?: string) {
    this.apiToken = apiToken || config.HUBSPOT_PRIVATE_APP_TOKEN || '';
    this.source = config.HUBSPOT_SOURCE;
    
    if (!this.apiToken) {
      logger.warn('HubSpot API token not configured, service will be disabled');
    } else {
      logger.info('HubSpot service initialized');
    }
  }

  /**
   * Upsert contact (create or update by email)
   */
  async upsertContact(contactData: HubSpotContact, idempotencyKey?: string): Promise<any> {
    if (!this.apiToken) {
      logger.warn('HubSpot not configured, skipping contact upsert');
      return { skipped: true, reason: 'not_configured' };
    }

    const key = idempotencyKey || uuidv4();
    
    try {
      logger.debug({ 
        contact: forLogging(contactData),
        idempotencyKey: key 
      }, 'Starting HubSpot contact upsert');

      // Prepare contact properties
      const properties = {
        email: contactData.email,
        firstname: contactData.firstname || '',
        lastname: contactData.lastname || '',
        phone: contactData.phone || '',
        hs_lead_status: contactData.hs_lead_status || 'NEW',
        lifecyclestage: contactData.lifecyclestage || 'lead',
        source: contactData.source || this.source,
        // Custom properties for voice agent
        voice_agent_contact: 'true',
        voice_agent_session_id: key,
        last_contact_date: new Date().toISOString(),
      };

      // Try to find existing contact first
      const existingContact = await this.findContactByEmail(contactData.email);
      
      let result;
      if (existingContact) {
        // Update existing contact
        result = await this.updateContact(existingContact.id, properties, key);
        logger.info({ 
          contactId: existingContact.id,
          email: contactData.email,
          idempotencyKey: key 
        }, 'HubSpot contact updated');
      } else {
        // Create new contact
        result = await this.createContact(properties, key);
        logger.info({ 
          contactId: result.id,
          email: contactData.email,
          idempotencyKey: key 
        }, 'HubSpot contact created');
      }

      return result;

    } catch (error: any) {
      logger.error({
        error: error.message,
        status: error.response?.status,
        email: contactData.email,
        idempotencyKey: key,
      }, 'HubSpot contact upsert failed');

      throw new Error(`HubSpot contact upsert failed: ${error.message}`);
    }
  }

  /**
   * Create a deal
   */
  async createDeal(dealData: HubSpotDeal, contactId: string, idempotencyKey?: string): Promise<any> {
    if (!this.apiToken) {
      logger.warn('HubSpot not configured, skipping deal creation');
      return { skipped: true, reason: 'not_configured' };
    }

    const key = idempotencyKey || uuidv4();
    
    try {
      logger.debug({ 
        deal: forLogging(dealData),
        contactId,
        idempotencyKey: key 
      }, 'Starting HubSpot deal creation');

      const properties = {
        dealname: dealData.dealname,
        amount: dealData.amount || 0,
        dealstage: dealData.dealstage || 'appointmentscheduled',
        pipeline: dealData.pipeline || config.HUBSPOT_PIPELINE_ID || 'default',
        closedate: dealData.closedate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
        source: dealData.source || this.source,
        // Custom properties
        voice_agent_deal: 'true',
        voice_agent_session_id: key,
      };

      const response = await httpWithRetry(hubspotClient, {
        method: 'POST',
        url: '/crm/v3/objects/deals',
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
        },
        data: { properties },
      });

      // Associate deal with contact
      if (contactId) {
        await this.associateDealWithContact(response.data.id, contactId);
      }

      logger.info({ 
        dealId: response.data.id,
        contactId,
        idempotencyKey: key 
      }, 'HubSpot deal created');

      return response.data;

    } catch (error: any) {
      logger.error({
        error: error.message,
        status: error.response?.status,
        contactId,
        idempotencyKey: key,
      }, 'HubSpot deal creation failed');

      throw new Error(`HubSpot deal creation failed: ${error.message}`);
    }
  }

  /**
   * Find contact by email
   */
  private async findContactByEmail(email: string): Promise<any> {
    try {
      const response = await httpWithRetry(hubspotClient, {
        method: 'POST',
        url: '/crm/v3/objects/contacts/search',
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
        },
        data: {
          filterGroups: [
            {
              filters: [
                {
                  propertyName: 'email',
                  operator: 'EQ',
                  value: email,
                },
              ],
            },
          ],
          properties: ['id', 'email', 'firstname', 'lastname', 'phone'],
          limit: 1,
        },
      });

      const results = response.data.results;
      return results.length > 0 ? results[0] : null;

    } catch (error: any) {
      logger.error({ error: error.message, email }, 'Failed to find contact by email');
      return null;
    }
  }

  /**
   * Create new contact
   */
  private async createContact(properties: any, idempotencyKey: string): Promise<any> {
    const response = await httpWithRetry(hubspotClient, {
      method: 'POST',
      url: '/crm/v3/objects/contacts',
      headers: {
        'Authorization': `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': idempotencyKey,
      },
      data: { properties },
    });

    return response.data;
  }

  /**
   * Update existing contact
   */
  private async updateContact(contactId: string, properties: any, idempotencyKey: string): Promise<any> {
    const response = await httpWithRetry(hubspotClient, {
      method: 'PATCH',
      url: `/crm/v3/objects/contacts/${contactId}`,
      headers: {
        'Authorization': `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': idempotencyKey,
      },
      data: { properties },
    });

    return response.data;
  }

  /**
   * Associate deal with contact
   */
  private async associateDealWithContact(dealId: string, contactId: string): Promise<void> {
    try {
      await httpWithRetry(hubspotClient, {
        method: 'PUT',
        url: `/crm/v3/objects/deals/${dealId}/associations/contacts/${contactId}/3`, // 3 = deal to contact association
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
        },
      });

      logger.debug({ dealId, contactId }, 'Deal associated with contact');

    } catch (error: any) {
      logger.error({
        error: error.message,
        dealId,
        contactId,
      }, 'Failed to associate deal with contact');
      // Don't throw - association failure shouldn't break the flow
    }
  }

  /**
   * Get account info and usage
   */
  async getAccountInfo(): Promise<any> {
    if (!this.apiToken) {
      return null;
    }

    try {
      const response = await httpWithRetry(hubspotClient, {
        method: 'GET',
        url: '/account-info/v3/details',
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
        },
      });

      return response.data;

    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to fetch HubSpot account info');
      return null;
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    if (!this.apiToken) {
      return false;
    }

    try {
      const accountInfo = await this.getAccountInfo();
      return !!accountInfo;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if service is configured
   */
  isConfigured(): boolean {
    return !!this.apiToken;
  }

  /**
   * Get service info
   */
  getServiceInfo() {
    return {
      provider: 'hubspot',
      configured: this.isConfigured(),
      source: this.source,
      features: ['contacts', 'deals', 'associations', 'search'],
    };
  }
}

// Singleton instance
export const hubspotService = new HubSpotService();
