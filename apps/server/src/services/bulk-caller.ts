import fs from 'fs/promises';
import { parse } from 'csv-parse/sync';
import { vapiService } from './vapi.js';
import { businessManager } from './business-manager.js';
import { createLogger } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

const logger = createLogger('bulk-caller');

export interface BulkCallRecord {
  phoneNumber: string;
  customerName?: string;
  businessId?: string;
  message?: string;
  scheduledTime?: string;
  priority?: 'high' | 'medium' | 'low';
}

export interface BulkCallResult {
  campaignId: string;
  totalNumbers: number;
  successfulCalls: number;
  failedCalls: number;
  results: Array<{
    phoneNumber: string;
    status: 'success' | 'failed';
    callId?: string;
    error?: string;
  }>;
}

/**
 * Bulk calling service for outbound campaigns
 */
export class BulkCallerService {
  private activeCampaigns = new Map<string, any>();

  /**
   * Process CSV file and initiate bulk calls
   */
  async processCsvFile(filePath: string, businessId: string, options: {
    concurrent?: number;
    delayBetweenCalls?: number;
    scheduledTime?: string;
  } = {}): Promise<BulkCallResult> {
    
    const campaignId = uuidv4();
    const concurrent = options.concurrent || 3; // Max 3 simultaneous calls
    const delay = options.delayBetweenCalls || 2000; // 2 seconds between calls

    logger.info({
      campaignId,
      filePath,
      businessId,
      concurrent,
      delay,
    }, 'Starting bulk call campaign');

    try {
      // Read and parse CSV
      const csvContent = await fs.readFile(filePath, 'utf-8');
      const records = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
      });

      // Validate business exists
      const business = businessManager.getBusiness(businessId);
      if (!business) {
        throw new Error(`Business ${businessId} not found`);
      }

      // Convert CSV records to call records
      const callRecords: BulkCallRecord[] = records.map((record: any) => ({
        phoneNumber: record.phoneNumber || record.phone || record.number,
        customerName: record.customerName || record.name || record.firstName,
        businessId,
        message: record.message || 'Outreach call',
        priority: record.priority || 'medium',
      }));

      logger.info({
        campaignId,
        totalRecords: callRecords.length,
        businessName: business.name,
      }, 'CSV processed, starting calls');

      // Track campaign
      this.activeCampaigns.set(campaignId, {
        businessId,
        totalNumbers: callRecords.length,
        startTime: Date.now(),
        status: 'running',
      });

      // Process calls with concurrency control
      const result = await this.processCalls(campaignId, callRecords, concurrent, delay);

      // Update campaign status
      this.activeCampaigns.set(campaignId, {
        ...this.activeCampaigns.get(campaignId),
        status: 'completed',
        endTime: Date.now(),
        result,
      });

      return result;

    } catch (error) {
      logger.error({
        error,
        campaignId,
        filePath,
        businessId,
      }, 'Bulk call campaign failed');

      this.activeCampaigns.set(campaignId, {
        ...this.activeCampaigns.get(campaignId),
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }

  /**
   * Process calls with concurrency control
   */
  private async processCalls(
    campaignId: string,
    records: BulkCallRecord[],
    concurrent: number,
    delay: number
  ): Promise<BulkCallResult> {
    
    const results: BulkCallResult['results'] = [];
    let successfulCalls = 0;
    let failedCalls = 0;

    // Process calls in batches
    for (let i = 0; i < records.length; i += concurrent) {
      const batch = records.slice(i, i + concurrent);
      
      logger.debug({
        campaignId,
        batchNumber: Math.floor(i / concurrent) + 1,
        batchSize: batch.length,
        totalBatches: Math.ceil(records.length / concurrent),
      }, 'Processing call batch');

      // Process batch concurrently
      const batchPromises = batch.map(async (record) => {
        try {
          const callResult = await this.makeCall(record);
          results.push({
            phoneNumber: record.phoneNumber,
            status: 'success',
            callId: callResult.id,
          });
          successfulCalls++;
          
          logger.debug({
            campaignId,
            phoneNumber: record.phoneNumber,
            callId: callResult.id,
          }, 'Call initiated successfully');

        } catch (error) {
          results.push({
            phoneNumber: record.phoneNumber,
            status: 'failed',
            error: error instanceof Error ? error.message : 'Unknown error',
          });
          failedCalls++;
          
          logger.warn({
            campaignId,
            phoneNumber: record.phoneNumber,
            error: error instanceof Error ? error.message : 'Unknown error',
          }, 'Call failed');
        }
      });

      // Wait for batch to complete
      await Promise.allSettled(batchPromises);

      // Delay between batches (except for last batch)
      if (i + concurrent < records.length) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    return {
      campaignId,
      totalNumbers: records.length,
      successfulCalls,
      failedCalls,
      results,
    };
  }

  /**
   * Make a single outbound call
   */
  private async makeCall(record: BulkCallRecord): Promise<any> {
    const business = businessManager.getBusiness(record.businessId!);
    if (!business) {
      throw new Error('Business not found');
    }

    // Get business phone number
    const businessPhone = business.phoneNumbers.find(p => p.isActive);
    if (!businessPhone) {
      throw new Error('No active phone numbers for business');
    }

    const callRequest = {
      assistantId: businessPhone.vapiAssistantId || process.env.VAPI_ASSISTANT_ID!,
      phoneNumber: record.phoneNumber,
      customer: {
        number: record.phoneNumber,
        name: record.customerName || 'Outreach Customer',
      },
      metadata: {
        businessId: record.businessId,
        businessName: business.name,
        campaignCall: true,
        message: record.message,
        priority: record.priority,
        timestamp: new Date().toISOString(),
      },
    };

    return await vapiService.createOutboundCall(callRequest);
  }

  /**
   * Get campaign status
   */
  getCampaignStatus(campaignId: string) {
    return this.activeCampaigns.get(campaignId);
  }

  /**
   * Get all campaigns
   */
  getAllCampaigns() {
    return Array.from(this.activeCampaigns.entries()).map(([id, campaign]) => ({
      campaignId: id,
      ...campaign,
    }));
  }

  /**
   * Cancel active campaign
   */
  cancelCampaign(campaignId: string): boolean {
    const campaign = this.activeCampaigns.get(campaignId);
    if (!campaign || campaign.status !== 'running') {
      return false;
    }

    campaign.status = 'cancelled';
    campaign.endTime = Date.now();

    logger.info({ campaignId }, 'Campaign cancelled');
    return true;
  }

  /**
   * Generate sample CSV for testing
   */
  async generateSampleCsv(filePath: string): Promise<void> {
    const sampleData = `phoneNumber,customerName,message,priority
+1555123456,John Smith,Follow up on restaurant inquiry,high
+1555234567,Sarah Johnson,Special promotion offer,medium
+1555345678,Mike Davis,Appointment reminder,high
+1555456789,Lisa Wilson,Customer satisfaction survey,low
+1555567890,David Brown,New menu announcement,medium`;

    await fs.writeFile(filePath, sampleData);
    
    logger.info({ filePath }, 'Sample CSV generated');
  }
}

// Singleton instance
export const bulkCallerService = new BulkCallerService();
