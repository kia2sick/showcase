#!/usr/bin/env tsx

import { Command } from 'commander';
import { config, validateOutboundConfig } from '../utils/env.js';
import { vapiService } from '../services/vapi.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('outbound-test');

/**
 * Vapi Outbound Call Test Script
 * Tests outbound calling functionality when properly configured
 */
class OutboundTester {
  constructor() {
    // Validate configuration on initialization
    try {
      validateOutboundConfig();
      logger.info('Outbound calling configuration validated');
    } catch (error) {
      logger.warn({
        error: error instanceof Error ? error.message : error,
        outboundEnabled: config.VAPI_OUTBOUND_ENABLED,
        hasApiKey: !!config.VAPI_API_KEY,
        hasAssistantId: !!config.VAPI_ASSISTANT_ID,
        hasCallerNumber: !!config.VAPI_CALLER_NUMBER,
        hasCalleeNumber: !!config.VAPI_CALLEE_NUMBER,
      }, 'Outbound calling not properly configured');
    }
  }

  /**
   * Test outbound calling capability
   */
  async testOutboundCall(): Promise<void> {
    console.log('🚀 Testing Vapi Outbound Calling');
    console.log('─'.repeat(50));

    // Check if outbound calling is enabled
    if (!config.VAPI_OUTBOUND_ENABLED) {
      console.log('❌ Outbound calling is disabled');
      console.log('   Set VAPI_OUTBOUND_ENABLED=true to enable');
      return;
    }

    // Check if service is properly configured
    if (!vapiService.isOutboundEnabled()) {
      console.log('❌ Outbound calling not properly configured');
      console.log('   Required environment variables:');
      console.log(`   - VAPI_API_KEY: ${config.VAPI_API_KEY ? '✅' : '❌'}`);
      console.log(`   - VAPI_ASSISTANT_ID: ${config.VAPI_ASSISTANT_ID ? '✅' : '❌'}`);
      console.log(`   - VAPI_CALLER_NUMBER: ${config.VAPI_CALLER_NUMBER ? '✅' : '❌'}`);
      console.log(`   - VAPI_CALLEE_NUMBER: ${config.VAPI_CALLEE_NUMBER ? '✅' : '❌'}`);
      return;
    }

    console.log('✅ Configuration validated');
    console.log(`📞 From: ${config.VAPI_CALLER_NUMBER}`);
    console.log(`📞 To: ${config.VAPI_CALLEE_NUMBER}`);
    console.log(`🤖 Assistant: ${config.VAPI_ASSISTANT_ID}`);

    try {
      // Test service connectivity first
      console.log('\n🔍 Testing Vapi service connectivity...');
      const isHealthy = await vapiService.healthCheck();
      
      if (!isHealthy) {
        console.log('❌ Vapi service health check failed');
        console.log('   Check your VAPI_API_KEY and network connectivity');
        return;
      }
      
      console.log('✅ Vapi service is accessible');

      // Get assistant information
      console.log('\n🤖 Retrieving assistant information...');
      const assistantInfo = await vapiService.getAssistant(config.VAPI_ASSISTANT_ID!);
      
      if (assistantInfo) {
        console.log(`✅ Assistant found: ${assistantInfo.name || assistantInfo.id}`);
      } else {
        console.log('⚠️  Could not retrieve assistant information (but may still work)');
      }

      // Initiate outbound call
      console.log('\n📞 Initiating outbound call...');
      
      const callRequest = {
        assistantId: config.VAPI_ASSISTANT_ID!,
        phoneNumber: config.VAPI_CALLEE_NUMBER!,
        customer: {
          number: config.VAPI_CALLEE_NUMBER!,
          name: 'Test Customer',
        },
        metadata: {
          testCall: true,
          timestamp: new Date().toISOString(),
          source: 'outbound-test-script',
        },
      };

      const callResult = await vapiService.createOutboundCall(callRequest);
      
      console.log('✅ Outbound call initiated successfully!');
      console.log(`📋 Call ID: ${callResult.id}`);
      console.log(`📊 Status: ${callResult.status || 'initiated'}`);
      
      if (callResult.cost) {
        console.log(`💰 Estimated cost: $${callResult.cost}`);
      }

      // Monitor call status
      console.log('\n⏳ Monitoring call status...');
      await this.monitorCall(callResult.id);

    } catch (error: any) {
      console.log('❌ Outbound call failed');
      console.log(`   Error: ${error.message}`);
      
      if (error.response?.status) {
        console.log(`   HTTP Status: ${error.response.status}`);
      }
      
      if (error.response?.data) {
        console.log(`   Response: ${JSON.stringify(error.response.data, null, 2)}`);
      }

      logger.error({
        error: error.message,
        status: error.response?.status,
        response: error.response?.data,
      }, 'Outbound call test failed');
    }
  }

  /**
   * Monitor call status
   */
  private async monitorCall(callId: string): Promise<void> {
    const maxAttempts = 10;
    const interval = 5000; // 5 seconds

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const callDetails = await vapiService.getCall(callId);
        
        console.log(`📊 Status check ${attempt}/${maxAttempts}: ${callDetails.status || 'unknown'}`);
        
        if (callDetails.status === 'ended' || callDetails.status === 'completed') {
          console.log('✅ Call completed');
          
          if (callDetails.duration) {
            console.log(`⏱️  Duration: ${callDetails.duration} seconds`);
          }
          
          if (callDetails.cost) {
            console.log(`💰 Final cost: $${callDetails.cost}`);
          }
          
          break;
        }
        
        if (callDetails.status === 'failed') {
          console.log('❌ Call failed');
          break;
        }
        
        // Wait before next check
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, interval));
        }
        
      } catch (error) {
        logger.warn({
          error: error instanceof Error ? error.message : error,
          callId,
          attempt,
        }, 'Failed to get call status');
        
        if (attempt === maxAttempts) {
          console.log('⚠️  Could not monitor call status');
        }
      }
    }
  }

  /**
   * List recent calls
   */
  async listRecentCalls(): Promise<void> {
    console.log('📋 Recent Vapi Calls');
    console.log('─'.repeat(50));

    if (!vapiService.isConfigured()) {
      console.log('❌ Vapi not configured');
      return;
    }

    try {
      const callsResponse = await vapiService.listCalls({
        limit: 10,
        assistantId: config.VAPI_ASSISTANT_ID,
      });

      const calls = callsResponse.calls || [];

      if (calls.length === 0) {
        console.log('📭 No recent calls found');
        return;
      }

      console.log(`📞 Found ${calls.length} recent calls:\n`);

      calls.forEach((call: any, index: number) => {
        const date = call.createdAt ? new Date(call.createdAt).toLocaleString() : 'Unknown';
        const duration = call.duration ? `${call.duration}s` : 'N/A';
        const status = call.status || 'unknown';
        const cost = call.cost ? `$${call.cost}` : 'N/A';

        console.log(`${index + 1}. Call ${call.id}`);
        console.log(`   📅 Date: ${date}`);
        console.log(`   📊 Status: ${status}`);
        console.log(`   ⏱️  Duration: ${duration}`);
        console.log(`   💰 Cost: ${cost}`);
        console.log('');
      });

    } catch (error: any) {
      console.log('❌ Failed to list calls');
      console.log(`   Error: ${error.message}`);

      logger.error({
        error: error.message,
      }, 'Failed to list recent calls');
    }
  }
}

// CLI setup
const program = new Command();

program
  .name('outbound-test')
  .description('Test Vapi outbound calling functionality')
  .version('1.0.0');

program
  .command('test')
  .description('Test outbound calling')
  .action(async () => {
    const tester = new OutboundTester();
    await tester.testOutboundCall();
  });

program
  .command('list')
  .description('List recent calls')
  .action(async () => {
    const tester = new OutboundTester();
    await tester.listRecentCalls();
  });

program
  .command('check')
  .description('Check outbound calling configuration')
  .action(() => {
    console.log('🔍 Outbound Calling Configuration Check');
    console.log('─'.repeat(50));
    
    console.log(`Outbound Enabled: ${config.VAPI_OUTBOUND_ENABLED ? '✅' : '❌'}`);
    console.log(`VAPI_API_KEY: ${config.VAPI_API_KEY ? '✅ Set' : '❌ Missing'}`);
    console.log(`VAPI_ASSISTANT_ID: ${config.VAPI_ASSISTANT_ID ? '✅ Set' : '❌ Missing'}`);
    console.log(`VAPI_CALLER_NUMBER: ${config.VAPI_CALLER_NUMBER ? '✅ Set' : '❌ Missing'}`);
    console.log(`VAPI_CALLEE_NUMBER: ${config.VAPI_CALLEE_NUMBER ? '✅ Set' : '❌ Missing'}`);
    
    const isFullyConfigured = vapiService.isOutboundEnabled();
    console.log(`\nStatus: ${isFullyConfigured ? '✅ Ready for outbound calling' : '❌ Not configured'}`);
    
    if (!isFullyConfigured) {
      console.log('\nTo enable outbound calling:');
      console.log('1. Set VAPI_OUTBOUND_ENABLED=true');
      console.log('2. Provide all required environment variables');
      console.log('3. Ensure your Vapi account has outbound calling enabled');
    }
  });

// Handle CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  program.parse();
}
