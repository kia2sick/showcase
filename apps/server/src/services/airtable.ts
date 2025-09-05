import { v4 as uuidv4 } from 'uuid';
import { AirtableReservation, AirtableMenuItem } from '../types/services.js';
import { airtableClient, httpWithRetry } from '../utils/http.js';
import { config } from '../utils/env.js';
import { crmLogger as logger } from '../utils/logger.js';
import { forLogging } from '../utils/redact.js';

/**
 * Airtable Service
 * Handles reservations and menu management
 */
export class AirtableService {
  private readonly apiKey: string;
  private readonly baseId: string;
  private readonly reservationsTable: string;
  private readonly menuTable: string;

  constructor(apiKey?: string, baseId?: string) {
    this.apiKey = apiKey || config.AIRTABLE_API_KEY || '';
    this.baseId = baseId || config.AIRTABLE_BASE_ID || '';
    this.reservationsTable = config.AIRTABLE_RESERVATIONS_TABLE;
    this.menuTable = config.AIRTABLE_MENU_TABLE;
    
    if (!this.apiKey || !this.baseId) {
      logger.warn('Airtable not fully configured, service will be disabled');
    } else {
      logger.info({ baseId: this.baseId }, 'Airtable service initialized');
    }
  }

  /**
   * Create a reservation
   */
  async createReservation(reservationData: AirtableReservation, idempotencyKey?: string): Promise<any> {
    if (!this.isConfigured()) {
      logger.warn('Airtable not configured, skipping reservation creation');
      return { skipped: true, reason: 'not_configured' };
    }

    const key = idempotencyKey || uuidv4();
    
    try {
      logger.debug({ 
        reservation: forLogging(reservationData),
        idempotencyKey: key 
      }, 'Starting Airtable reservation creation');

      // Prepare fields for Airtable
      const fields = {
        'Name': reservationData.Name,
        'Email': reservationData.Email || '',
        'Phone': reservationData.Phone || '',
        'Party Size': reservationData['Party Size'],
        'Date & Time': reservationData['Date & Time'],
        'Special Requests': reservationData['Special Requests'] || '',
        'Status': reservationData.Status || 'Confirmed',
        'Source': reservationData.Source || 'Voice Agent',
        'Created At': reservationData['Created At'] || new Date().toISOString(),
        // Internal tracking
        'Voice Agent Session': key,
      };

      const response = await httpWithRetry(airtableClient, {
        method: 'POST',
        url: `/${this.baseId}/${this.reservationsTable}`,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        data: {
          fields,
          typecast: true, // Auto-convert field types
        },
      });

      logger.info({ 
        recordId: response.data.id,
        name: reservationData.Name,
        dateTime: reservationData['Date & Time'],
        idempotencyKey: key 
      }, 'Airtable reservation created');

      return response.data;

    } catch (error: any) {
      logger.error({
        error: error.message,
        status: error.response?.status,
        reservation: forLogging(reservationData),
        idempotencyKey: key,
      }, 'Airtable reservation creation failed');

      // Check if it's a rate limit error
      if (error.response?.status === 429) {
        const retryAfter = error.response.headers['retry-after'] || 30;
        throw new Error(`Airtable rate limited. Retry after ${retryAfter} seconds.`);
      }

      throw new Error(`Airtable reservation creation failed: ${error.message}`);
    }
  }

  /**
   * Update a reservation
   */
  async updateReservation(recordId: string, updates: Partial<AirtableReservation>, idempotencyKey?: string): Promise<any> {
    if (!this.isConfigured()) {
      logger.warn('Airtable not configured, skipping reservation update');
      return { skipped: true, reason: 'not_configured' };
    }

    const key = idempotencyKey || uuidv4();
    
    try {
      logger.debug({ 
        recordId,
        updates: forLogging(updates),
        idempotencyKey: key 
      }, 'Starting Airtable reservation update');

      const response = await httpWithRetry(airtableClient, {
        method: 'PATCH',
        url: `/${this.baseId}/${this.reservationsTable}/${recordId}`,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        data: {
          fields: updates,
          typecast: true,
        },
      });

      logger.info({ 
        recordId,
        idempotencyKey: key 
      }, 'Airtable reservation updated');

      return response.data;

    } catch (error: any) {
      logger.error({
        error: error.message,
        status: error.response?.status,
        recordId,
        idempotencyKey: key,
      }, 'Airtable reservation update failed');

      throw new Error(`Airtable reservation update failed: ${error.message}`);
    }
  }

  /**
   * List reservations with optional filtering
   */
  async listReservations(options: {
    maxRecords?: number;
    filterByFormula?: string;
    sort?: Array<{ field: string; direction: 'asc' | 'desc' }>;
  } = {}): Promise<any[]> {
    if (!this.isConfigured()) {
      logger.warn('Airtable not configured, returning empty reservations list');
      return [];
    }

    try {
      const params = new URLSearchParams();
      
      if (options.maxRecords) {
        params.append('maxRecords', options.maxRecords.toString());
      }
      
      if (options.filterByFormula) {
        params.append('filterByFormula', options.filterByFormula);
      }
      
      if (options.sort) {
        options.sort.forEach((sortOption, index) => {
          params.append(`sort[${index}][field]`, sortOption.field);
          params.append(`sort[${index}][direction]`, sortOption.direction);
        });
      }

      const response = await httpWithRetry(airtableClient, {
        method: 'GET',
        url: `/${this.baseId}/${this.reservationsTable}?${params.toString()}`,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      logger.debug({ count: response.data.records.length }, 'Retrieved reservations from Airtable');

      return response.data.records;

    } catch (error: any) {
      logger.error({
        error: error.message,
        status: error.response?.status,
      }, 'Failed to list reservations from Airtable');

      return [];
    }
  }

  /**
   * List menu items
   */
  async listMenu(): Promise<AirtableMenuItem[]> {
    if (!this.isConfigured()) {
      logger.warn('Airtable not configured, returning empty menu');
      return [];
    }

    try {
      const response = await httpWithRetry(airtableClient, {
        method: 'GET',
        url: `/${this.baseId}/${this.menuTable}`,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      const menuItems = response.data.records.map((record: any) => ({
        ...record.fields,
        id: record.id,
      }));

      logger.debug({ count: menuItems.length }, 'Retrieved menu items from Airtable');

      return menuItems;

    } catch (error: any) {
      logger.error({
        error: error.message,
        status: error.response?.status,
      }, 'Failed to list menu from Airtable');

      return [];
    }
  }

  /**
   * Get reservation by ID
   */
  async getReservation(recordId: string): Promise<any> {
    if (!this.isConfigured()) {
      return null;
    }

    try {
      const response = await httpWithRetry(airtableClient, {
        method: 'GET',
        url: `/${this.baseId}/${this.reservationsTable}/${recordId}`,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      return response.data;

    } catch (error: any) {
      logger.error({
        error: error.message,
        status: error.response?.status,
        recordId,
      }, 'Failed to get reservation from Airtable');

      return null;
    }
  }

  /**
   * Delete reservation
   */
  async deleteReservation(recordId: string): Promise<boolean> {
    if (!this.isConfigured()) {
      return false;
    }

    try {
      await httpWithRetry(airtableClient, {
        method: 'DELETE',
        url: `/${this.baseId}/${this.reservationsTable}/${recordId}`,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      logger.info({ recordId }, 'Airtable reservation deleted');
      return true;

    } catch (error: any) {
      logger.error({
        error: error.message,
        status: error.response?.status,
        recordId,
      }, 'Failed to delete reservation from Airtable');

      return false;
    }
  }

  /**
   * Get today's reservations
   */
  async getTodaysReservations(): Promise<any[]> {
    const today = new Date().toISOString().split('T')[0];
    
    return this.listReservations({
      filterByFormula: `DATESTR({Date & Time}) = '${today}'`,
      sort: [{ field: 'Date & Time', direction: 'asc' }],
      maxRecords: 100,
    });
  }

  /**
   * Get upcoming reservations
   */
  async getUpcomingReservations(days: number = 7): Promise<any[]> {
    const today = new Date().toISOString().split('T')[0];
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);
    const futureDateStr = futureDate.toISOString().split('T')[0];
    
    return this.listReservations({
      filterByFormula: `AND(DATESTR({Date & Time}) >= '${today}', DATESTR({Date & Time}) <= '${futureDateStr}')`,
      sort: [{ field: 'Date & Time', direction: 'asc' }],
      maxRecords: 200,
    });
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    if (!this.isConfigured()) {
      return false;
    }

    try {
      // Try to list a single record to test connectivity
      await this.listReservations({ maxRecords: 1 });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if service is configured
   */
  isConfigured(): boolean {
    return !!(this.apiKey && this.baseId);
  }

  /**
   * Get service info
   */
  getServiceInfo() {
    return {
      provider: 'airtable',
      configured: this.isConfigured(),
      baseId: this.baseId ? `${this.baseId.substring(0, 8)}...` : 'not_set',
      tables: {
        reservations: this.reservationsTable,
        menu: this.menuTable,
      },
      features: ['reservations', 'menu', 'search', 'filtering'],
    };
  }
}

// Singleton instance
export const airtableService = new AirtableService();
