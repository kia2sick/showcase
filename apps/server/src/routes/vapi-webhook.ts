import { Request, Response } from 'express';
import { VapiWebhookEventSchema } from '../types/vapi.js';
import { sessionStore } from '../memory/session-store.js';
import { agentRouter } from '../agents/index.js';
import { businessManager } from '../services/business-manager.js';
import { webhookLogger as logger } from '../utils/logger.js';
import { forLogging } from '../utils/redact.js';

/**
 * Vapi webhook handler
 * Processes incoming webhook events from Vapi
 */
export async function handleVapiWebhook(req: Request, res: Response) {
  try {
    // Enhanced logging for debugging
    console.log('\n🎯 === VAPI WEBHOOK RECEIVED ===');
    console.log(`📞 Event Type: ${req.body?.type || 'UNKNOWN'}`);
    console.log(`🆔 Call ID: ${req.body?.callId || 'UNKNOWN'}`);
    console.log(`⏰ Timestamp: ${new Date().toLocaleTimeString()}`);
    console.log('📋 Full Body:', JSON.stringify(req.body, null, 2));
    console.log('=================================\n');

    logger.debug({ 
      headers: req.headers,
      body: forLogging(req.body) 
    }, 'Vapi webhook received');

    // Validate the webhook payload
    const event = VapiWebhookEventSchema.parse(req.body);
    
    logger.info({
      type: event.type,
      callId: event.callId,
    }, 'Processing Vapi webhook event');

    // Process the event
    await processVapiEvent(event);

    // Respond quickly to Vapi
    res.status(200).json({ received: true });

  } catch (error) {
    logger.error({
      error,
      body: forLogging(req.body),
    }, 'Vapi webhook processing failed');

    // Still respond with 200 to avoid retries for malformed data
    res.status(200).json({ 
      received: true, 
      error: 'Processing failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Process different types of Vapi events
 */
async function processVapiEvent(event: any) {
  switch (event.type) {
    case 'call.started':
      await handleCallStarted(event);
      break;
      
    case 'asr.partial':
      await handleASRPartial(event);
      break;
      
    case 'asr.final':
      await handleASRFinal(event);
      break;
      
    case 'call.ended':
      await handleCallEnded(event);
      break;
      
    case 'function.call':
      await handleFunctionCall(event);
      break;
      
    default:
      logger.warn({ 
        type: event.type,
        callId: event.callId 
      }, 'Unknown Vapi event type');
  }
}

/**
 * Handle call started event
 */
async function handleCallStarted(event: any) {
  try {
    const phoneNumber = event.call?.phoneNumber;
    const customerPhone = event.call?.customer?.number;

    console.log('\n🏢 === BUSINESS CALL STARTED ===');
    console.log(`📞 Business Phone: ${phoneNumber}`);
    console.log(`👤 Customer Phone: ${customerPhone}`);
    console.log(`🆔 Call ID: ${event.callId}`);

    // Find which business this call belongs to
    const business = businessManager.getBusinessByPhone(phoneNumber);
    if (!business) {
      console.log('❌ No business found for phone number:', phoneNumber);
      logger.warn({ phoneNumber }, 'No business configured for phone number');
      return;
    }

    console.log(`🏢 Business: ${business.name} (${business.industry})`);
    console.log(`🎯 Primary Intent: ${business.voiceConfig.primaryIntent}`);
    console.log('================================\n');

    // Start business session
    const businessSession = businessManager.startSession(phoneNumber, customerPhone, event.callId);
    if (!businessSession) {
      logger.error({ phoneNumber, callId: event.callId }, 'Failed to start business session');
      return;
    }

    // Create legacy session for compatibility
    const session = sessionStore.create(event.callId, {
      businessId: business.id,
      businessName: business.name,
      phoneNumber,
      customer: event.call?.customer,
      assistantId: event.call?.assistantId,
      vapiMetadata: event.call?.metadata,
      businessConfig: business.voiceConfig,
    });

    // Use custom greeting if configured
    const greeting = business.voiceConfig.customPrompts.greeting || agentRouter.getInitialGreeting();
    
    sessionStore.addTranscript(event.callId, {
      who: 'agent',
      text: greeting,
      timestamp: Date.now(),
    });

    logger.info({
      callId: event.callId,
      businessId: business.id,
      businessName: business.name,
      customerPhone,
      primaryIntent: business.voiceConfig.primaryIntent,
    }, 'Business call started');

  } catch (error) {
    console.log('❌ ERROR starting call:', error);
    logger.error({
      error,
      callId: event.callId,
    }, 'Failed to handle call started event');
  }
}

/**
 * Handle partial ASR (speech recognition) results
 */
async function handleASRPartial(event: any) {
  try {
    logger.debug({
      callId: event.callId,
      transcript: event.transcript,
      confidence: event.confidence,
    }, 'Partial ASR result');

    // For partial results, we might want to show typing indicators
    // or prepare responses, but typically don't take action until final
    
  } catch (error) {
    logger.error({
      error,
      callId: event.callId,
    }, 'Failed to handle ASR partial event');
  }
}

/**
 * Handle final ASR results and generate responses
 */
async function handleASRFinal(event: any) {
  try {
    // Live transcription display
    console.log('\n🎤 === LIVE TRANSCRIPTION ===');
    console.log(`👤 CALLER SAID: "${event.transcript}"`);
    console.log(`🎯 Confidence: ${(event.confidence * 100).toFixed(1)}%`);
    console.log(`🆔 Call: ${event.callId}`);
    console.log('============================\n');

    logger.info({
      callId: event.callId,
      transcript: event.transcript,
      confidence: event.confidence,
    }, 'Final ASR result');

    const session = sessionStore.get(event.callId);
    if (!session) {
      console.log('❌ No session found for call:', event.callId);
      logger.warn({
        callId: event.callId,
      }, 'No session found for ASR final event');
      return;
    }

    // Add caller transcript
    sessionStore.addTranscript(event.callId, {
      who: 'caller',
      text: event.transcript,
      timestamp: Date.now(),
      confidence: event.confidence,
    });

    console.log('🧠 Processing with AI agent...');

    // Generate agent response
    const response = await agentRouter.processMessage(session, event.transcript);

    // Add agent response to transcript
    sessionStore.addTranscript(event.callId, {
      who: 'agent',
      text: response,
      timestamp: Date.now(),
    });

    // Live response display
    console.log('\n🤖 === AI AGENT RESPONSE ===');
    console.log(`🗣️ AGENT SAYS: "${response}"`);
    console.log(`🎯 Intent: ${session.currentIntent || 'detecting...'}`);
    console.log(`📊 Data Collected:`, session.collected);
    console.log('============================\n');

    logger.info({
      callId: event.callId,
      responseGenerated: true,
      responseLength: response.length,
      currentIntent: session.currentIntent,
    }, 'Agent response generated');

    // In a real implementation, you would send this response back to Vapi
    // via their API to have it spoken to the caller

  } catch (error) {
    console.log('❌ ERROR processing speech:', error);
    logger.error({
      error,
      callId: event.callId,
      transcript: event.transcript,
    }, 'Failed to handle ASR final event');
  }
}

/**
 * Handle call ended event
 */
async function handleCallEnded(event: any) {
  try {
    logger.info({
      callId: event.callId,
      duration: event.call?.duration,
      endedReason: event.call?.endedReason,
      cost: event.call?.cost,
    }, 'Call ended');

    const session = sessionStore.get(event.callId);
    if (!session) {
      logger.warn({
        callId: event.callId,
      }, 'No session found for call ended event');
      return;
    }

    // Mark session as inactive
    sessionStore.deactivate(event.callId);

    // Log call summary
    const callSummary = {
      callId: event.callId,
      duration: event.call?.duration,
      intent: session.currentIntent,
      collectedData: forLogging(session.collected),
      transcriptLength: session.transcript.length,
      crmActions: session.crmActions.length,
      successfulCRMActions: session.crmActions.filter(a => a.status === 'success').length,
    };

    logger.info(callSummary, 'Call completed with summary');

  } catch (error) {
    logger.error({
      error,
      callId: event.callId,
    }, 'Failed to handle call ended event');
  }
}

/**
 * Handle function call events (if using Vapi function calling)
 */
async function handleFunctionCall(event: any) {
  try {
    logger.info({
      callId: event.callId,
      functionName: event.functionCall?.name,
      parameters: forLogging(event.functionCall?.parameters),
    }, 'Function call received');

    // Handle different function calls
    switch (event.functionCall?.name) {
      case 'transfer_to_human':
        await handleTransferToHuman(event);
        break;
        
      case 'end_call':
        await handleEndCall(event);
        break;
        
      default:
        logger.warn({
          callId: event.callId,
          functionName: event.functionCall?.name,
        }, 'Unknown function call');
    }

  } catch (error) {
    logger.error({
      error,
      callId: event.callId,
      functionCall: event.functionCall,
    }, 'Failed to handle function call event');
  }
}

/**
 * Handle transfer to human request
 */
async function handleTransferToHuman(event: any) {
  const session = sessionStore.get(event.callId);
  if (!session) return;

  logger.info({
    callId: event.callId,
    reason: event.functionCall?.parameters?.reason,
  }, 'Transfer to human requested');

  // Add note to session
  sessionStore.addTranscript(event.callId, {
    who: 'agent',
    text: 'Transferring to human agent as requested',
    timestamp: Date.now(),
  });

  // In a real implementation, you would trigger the transfer via Vapi's API
}

/**
 * Handle end call request
 */
async function handleEndCall(event: any) {
  const session = sessionStore.get(event.callId);
  if (!session) return;

  logger.info({
    callId: event.callId,
    reason: event.functionCall?.parameters?.reason,
  }, 'End call requested');

  // Add final message
  sessionStore.addTranscript(event.callId, {
    who: 'agent',
    text: 'Thank you for calling. Have a great day!',
    timestamp: Date.now(),
  });

  // Mark session as completed
  sessionStore.deactivate(event.callId);
}
