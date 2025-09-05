#!/usr/bin/env tsx

import fs from 'fs/promises';
import path from 'path';
import { Command } from 'commander';
import { config } from '../utils/env.js';
import { simLogger as logger } from '../utils/logger.js';
import { sessionStore } from '../memory/session-store.js';
import { agentRouter } from '../agents/index.js';
import { getScenario, listScenarios, SimulationScenario } from './fake-events.js';
import { WhisperSTTService } from '../services/stt/whisper.js';
import { DeepgramSTTService } from '../services/stt/deepgram.js';
import { ElevenLabsTTSService } from '../services/tts/elevenlabs.js';
import { createFallbackTTSService } from '../services/tts/fallback.js';
import { TTSService, STTService } from '../types/services.js';
import { forLogging } from '../utils/redact.js';

/**
 * Local Call Simulator
 * Simulates voice conversations without requiring paid telephony services
 */
class CallSimulator {
  private sttService: STTService | null = null;
  private ttsService: TTSService;
  private outputDir = '.sim-out';
  private sessionLog: any[] = [];

  constructor() {
    // Initialize TTS service
    try {
      if (config.ELEVEN_API_KEY) {
        this.ttsService = new ElevenLabsTTSService();
        logger.info('Using ElevenLabs TTS for simulation');
      } else {
        this.ttsService = createFallbackTTSService();
        logger.info('Using fallback TTS for simulation');
      }
    } catch (error) {
      logger.warn('TTS initialization failed, using fallback');
      this.ttsService = createFallbackTTSService();
    }

    // Initialize STT service (optional for simulation)
    try {
      if (config.STT_PROVIDER === 'whisper' && config.OPENAI_API_KEY) {
        this.sttService = new WhisperSTTService();
        logger.info('STT service available for audio processing');
      } else if (config.STT_PROVIDER === 'deepgram' && config.DEEPGRAM_API_KEY) {
        this.sttService = new DeepgramSTTService();
        logger.info('STT service available for audio processing');
      }
    } catch (error) {
      logger.warn('STT service not available, using text-only simulation');
    }
  }

  /**
   * Run a simulation scenario
   */
  async runScenario(scenarioName: string): Promise<void> {
    const scenario = getScenario(scenarioName);
    if (!scenario) {
      throw new Error(`Scenario '${scenarioName}' not found`);
    }

    logger.info({
      scenario: scenario.name,
      description: scenario.description,
      callId: scenario.callId,
    }, 'Starting simulation');

    console.log(`\n🎭 Starting simulation: ${scenario.name}`);
    console.log(`📝 ${scenario.description}`);
    console.log(`📞 Call ID: ${scenario.callId}`);
    console.log(`👤 Customer: ${scenario.customerInfo.name}`);
    console.log('─'.repeat(60));

    // Initialize session log
    this.sessionLog = [{
      timestamp: new Date().toISOString(),
      event: 'simulation_started',
      scenario: scenario.name,
      callId: scenario.callId,
      customer: forLogging(scenario.customerInfo),
    }];

    // Create session
    const session = sessionStore.create(scenario.callId, {
      customer: scenario.customerInfo,
      simulationScenario: scenario.name,
    });

    // Process each interaction
    for (let i = 0; i < scenario.interactions.length; i++) {
      const interaction = scenario.interactions[i];
      await this.processInteraction(scenario, interaction, i);
      
      // Add delay between interactions for realism
      if (config.SIM_TRANSCRIPT_SPEED === 'realtime') {
        await this.delay(interaction.duration || 1000);
      } else {
        await this.delay(200); // Fast mode
      }
    }

    // Generate final report
    await this.generateReport(scenario);

    console.log('─'.repeat(60));
    console.log('✅ Simulation completed successfully!');
    console.log(`📊 Report saved to: ${this.outputDir}/${scenario.callId}.json`);
  }

  /**
   * Process a single interaction
   */
  private async processInteraction(
    scenario: SimulationScenario, 
    interaction: any, 
    index: number
  ): Promise<void> {
    const logEntry: any = {
      timestamp: new Date().toISOString(),
      index,
      type: interaction.type,
    };

    switch (interaction.type) {
      case 'system_event':
        await this.handleSystemEvent(scenario, interaction, logEntry);
        break;
        
      case 'caller_speech':
        await this.handleCallerSpeech(scenario, interaction, logEntry);
        break;
        
      case 'agent_response':
        await this.handleAgentResponse(scenario, interaction, logEntry);
        break;
        
      case 'pause':
        await this.handlePause(interaction, logEntry);
        break;
    }

    this.sessionLog.push(logEntry);
  }

  /**
   * Handle system events (call started, ended)
   */
  private async handleSystemEvent(scenario: SimulationScenario, interaction: any, logEntry: any): Promise<void> {
    console.log(`🔧 ${interaction.text}`);
    
    logEntry.event = interaction.metadata?.event;
    logEntry.text = interaction.text;
    logEntry.metadata = interaction.metadata;

    if (interaction.metadata?.event === 'call.started') {
      // Simulate initial greeting
      const greeting = agentRouter.getInitialGreeting();
      sessionStore.addTranscript(scenario.callId, {
        who: 'agent',
        text: greeting,
        timestamp: Date.now(),
      });

      console.log(`🤖 Agent: ${greeting}`);
      
      // Generate TTS for greeting
      await this.generateTTS(greeting, `${scenario.callId}_agent_${Date.now()}`);
    }
  }

  /**
   * Handle caller speech
   */
  private async handleCallerSpeech(scenario: SimulationScenario, interaction: any, logEntry: any): Promise<void> {
    const callerText = interaction.text;
    console.log(`👤 Caller: ${callerText}`);
    
    logEntry.text = callerText;
    logEntry.audioFile = interaction.audioFile;

    // Add to transcript
    sessionStore.addTranscript(scenario.callId, {
      who: 'caller',
      text: callerText,
      timestamp: Date.now(),
    });

    // Get updated session
    const session = sessionStore.get(scenario.callId);
    if (!session) {
      throw new Error('Session not found');
    }

    // Generate agent response
    const agentResponse = await agentRouter.processMessage(session, callerText);
    
    // Add agent response to transcript
    sessionStore.addTranscript(scenario.callId, {
      who: 'agent',
      text: agentResponse,
      timestamp: Date.now(),
    });

    console.log(`🤖 Agent: ${agentResponse}`);
    
    // Generate TTS for agent response
    await this.generateTTS(agentResponse, `${scenario.callId}_agent_${Date.now()}`);

    // Update log entry with response
    logEntry.agentResponse = agentResponse;
    logEntry.sessionState = {
      intent: session.currentIntent,
      collected: forLogging(session.collected),
      crmActions: session.crmActions.length,
    };
  }

  /**
   * Handle pre-scripted agent responses
   */
  private async handleAgentResponse(scenario: SimulationScenario, interaction: any, logEntry: any): Promise<void> {
    const agentText = interaction.text;
    console.log(`🤖 Agent: ${agentText}`);
    
    logEntry.text = agentText;

    // Add to transcript
    sessionStore.addTranscript(scenario.callId, {
      who: 'agent',
      text: agentText,
      timestamp: Date.now(),
    });

    // Generate TTS
    await this.generateTTS(agentText, `${scenario.callId}_agent_${Date.now()}`);
  }

  /**
   * Handle pauses
   */
  private async handlePause(interaction: any, logEntry: any): Promise<void> {
    const duration = interaction.duration || 1000;
    console.log(`⏸️  [Pause: ${duration}ms]`);
    
    logEntry.duration = duration;
    
    if (config.SIM_TRANSCRIPT_SPEED === 'realtime') {
      await this.delay(duration);
    }
  }

  /**
   * Generate TTS audio for agent responses
   */
  private async generateTTS(text: string, filename: string): Promise<void> {
    try {
      const result = await this.ttsService.synthesize(text);
      const outputPath = path.join(this.outputDir, `${filename}.mp3`);
      
      await fs.writeFile(outputPath, result.audio);
      
      logger.debug({
        text: text.substring(0, 50),
        outputPath,
        audioSize: result.audio.length,
      }, 'TTS audio generated');
      
    } catch (error) {
      logger.warn({
        error,
        text: text.substring(0, 50),
      }, 'TTS generation failed');
    }
  }

  /**
   * Generate simulation report
   */
  private async generateReport(scenario: SimulationScenario): Promise<void> {
    const session = sessionStore.get(scenario.callId);
    if (!session) {
      throw new Error('Session not found for report generation');
    }

    const report = {
      simulation: {
        scenario: scenario.name,
        description: scenario.description,
        callId: scenario.callId,
        startTime: this.sessionLog[0]?.timestamp,
        endTime: new Date().toISOString(),
        duration: Date.now() - new Date(this.sessionLog[0]?.timestamp).getTime(),
      },
      customer: forLogging(scenario.customerInfo),
      conversation: {
        intent: session.currentIntent,
        totalInteractions: scenario.interactions.length,
        transcript: session.transcript.map(entry => ({
          who: entry.who,
          text: entry.text,
          timestamp: entry.timestamp,
        })),
      },
      dataCollection: {
        collected: forLogging(session.collected),
        requiredFields: this.getRequiredFieldsStatus(session),
      },
      crmActions: session.crmActions.map(action => ({
        type: action.type,
        status: action.status,
        timestamp: action.timestamp,
        data: forLogging(action.data),
        error: action.error,
      })),
      sessionLog: this.sessionLog,
      summary: this.generateSummary(session, scenario),
    };

    // Save report
    const reportPath = path.join(this.outputDir, `${scenario.callId}.json`);
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

    // Print summary to console
    this.printSummary(report);

    logger.info({
      callId: scenario.callId,
      reportPath,
      intent: session.currentIntent,
      crmActions: session.crmActions.length,
    }, 'Simulation report generated');
  }

  /**
   * Get required fields status
   */
  private getRequiredFieldsStatus(session: any): any {
    const intent = session.currentIntent;
    if (!intent) return {};

    const requiredFields = {
      lead: ['name', 'email'],
      booking: ['name', 'partySize', 'dateTime'],
      menu: [],
    }[intent] || [];

    const status: any = {};
    requiredFields.forEach(field => {
      status[field] = !!session.collected[field];
    });

    return status;
  }

  /**
   * Generate conversation summary
   */
  private generateSummary(session: any, scenario: SimulationScenario): any {
    const successfulCRMActions = session.crmActions.filter((a: any) => a.status === 'success').length;
    const failedCRMActions = session.crmActions.filter((a: any) => a.status === 'failed').length;

    return {
      success: session.currentIntent && (successfulCRMActions > 0 || session.currentIntent === 'menu'),
      intent: session.currentIntent,
      dataCompleteness: this.calculateDataCompleteness(session),
      crmSuccess: successfulCRMActions > 0,
      crmActions: {
        total: session.crmActions.length,
        successful: successfulCRMActions,
        failed: failedCRMActions,
      },
      conversationFlow: this.analyzeConversationFlow(session),
    };
  }

  /**
   * Calculate data completeness percentage
   */
  private calculateDataCompleteness(session: any): number {
    const intent = session.currentIntent;
    if (!intent) return 0;

    const requiredFields = {
      lead: ['name', 'email'],
      booking: ['name', 'partySize', 'dateTime'],
      menu: [],
    }[intent] || [];

    if (requiredFields.length === 0) return 100;

    const completedFields = requiredFields.filter(field => !!session.collected[field]).length;
    return Math.round((completedFields / requiredFields.length) * 100);
  }

  /**
   * Analyze conversation flow
   */
  private analyzeConversationFlow(session: any): any {
    const transcript = session.transcript;
    const callerMessages = transcript.filter((entry: any) => entry.who === 'caller').length;
    const agentMessages = transcript.filter((entry: any) => entry.who === 'agent').length;

    return {
      totalExchanges: Math.min(callerMessages, agentMessages),
      callerMessages,
      agentMessages,
      averageResponseLength: agentMessages > 0 
        ? Math.round(transcript.filter((entry: any) => entry.who === 'agent')
            .reduce((sum: number, entry: any) => sum + entry.text.length, 0) / agentMessages)
        : 0,
    };
  }

  /**
   * Print summary to console
   */
  private printSummary(report: any): void {
    console.log('\n📊 SIMULATION SUMMARY');
    console.log('─'.repeat(40));
    console.log(`Intent: ${report.conversation.intent || 'Not determined'}`);
    console.log(`Success: ${report.summary.success ? '✅' : '❌'}`);
    console.log(`Data Completeness: ${report.summary.dataCompleteness}%`);
    console.log(`CRM Actions: ${report.summary.crmActions.successful}/${report.summary.crmActions.total} successful`);
    console.log(`Conversation Exchanges: ${report.summary.conversationFlow.totalExchanges}`);
    
    if (Object.keys(report.dataCollection.collected).length > 0) {
      console.log('\n📝 Collected Data:');
      Object.entries(report.dataCollection.collected).forEach(([key, value]) => {
        if (value) console.log(`  ${key}: ${value}`);
      });
    }

    if (report.crmActions.length > 0) {
      console.log('\n🔄 CRM Actions:');
      report.crmActions.forEach((action: any) => {
        const status = action.status === 'success' ? '✅' : action.status === 'failed' ? '❌' : '⏳';
        console.log(`  ${status} ${action.type}`);
      });
    }
  }

  /**
   * Utility function for delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Ensure output directory exists
   */
  async ensureOutputDir(): Promise<void> {
    try {
      await fs.access(this.outputDir);
    } catch {
      await fs.mkdir(this.outputDir, { recursive: true });
    }
  }
}

// CLI setup
const program = new Command();

program
  .name('call-simulator')
  .description('Local voice call simulator for testing the voice agent')
  .version('1.0.0');

program
  .command('list')
  .description('List available simulation scenarios')
  .action(() => {
    console.log('\n📋 Available Scenarios:');
    console.log('─'.repeat(50));
    
    listScenarios().forEach(scenario => {
      console.log(`🎭 ${scenario.name}`);
      console.log(`   ${scenario.description}\n`);
    });
  });

program
  .command('run')
  .description('Run a simulation scenario')
  .argument('<scenario>', 'Scenario name to run')
  .option('-v, --verbose', 'Enable verbose logging')
  .action(async (scenario, options) => {
    if (options.verbose) {
      process.env.LOG_LEVEL = 'debug';
    }

    const simulator = new CallSimulator();
    
    try {
      await simulator.ensureOutputDir();
      await simulator.runScenario(scenario);
    } catch (error) {
      console.error('❌ Simulation failed:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Handle CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  program.parse();
}
