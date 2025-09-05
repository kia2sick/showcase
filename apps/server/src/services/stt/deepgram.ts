import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { STTService, STTOptions, STTResult, STTStreamingSession } from '../../types/services.js';
import { config } from '../../utils/env.js';
import { sttLogger as logger } from '../../utils/logger.js';

/**
 * Deepgram STT Service
 * Supports both file transcription and real-time streaming
 */
export class DeepgramSTTService implements STTService {
  private readonly apiKey: string;
  private readonly baseUrl = 'wss://api.deepgram.com/v1/listen';

  constructor(apiKey?: string) {
    this.apiKey = apiKey || config.DEEPGRAM_API_KEY || '';
    
    if (!this.apiKey) {
      throw new Error('Deepgram API key is required for Deepgram STT service');
    }

    logger.info('Deepgram STT service initialized');
  }

  /**
   * Transcribe audio buffer (simulated via streaming for consistency)
   */
  async transcribeBuffer(audioBuffer: Buffer, options: STTOptions = {}): Promise<STTResult> {
    return new Promise((resolve, reject) => {
      const session = this.startStreaming(options);
      let result: STTResult | null = null;
      
      const timeout = setTimeout(() => {
        session.stop();
        reject(new Error('Deepgram transcription timeout'));
      }, 30000);

      session.on('transcript', (transcriptResult) => {
        result = transcriptResult;
      });

      session.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      session.on('close', () => {
        clearTimeout(timeout);
        if (result) {
          resolve(result);
        } else {
          reject(new Error('No transcription result received'));
        }
      });

      // Send audio data
      session.sendAudio(audioBuffer);
      
      // Close connection after a short delay to allow processing
      setTimeout(() => {
        session.stop();
      }, 1000);
    });
  }

  /**
   * Start streaming transcription session
   */
  startStreaming(options: STTOptions = {}): STTStreamingSession {
    return new DeepgramStreamingSession(this.apiKey, this.baseUrl, options);
  }

  /**
   * Get service info
   */
  getServiceInfo() {
    return {
      provider: 'deepgram',
      service: 'nova-2',
      supportsStreaming: true,
      supportedFormats: ['wav', 'mp3', 'flac', 'opus', 'webm'],
    };
  }
}

/**
 * Deepgram streaming session
 */
class DeepgramStreamingSession extends EventEmitter implements STTStreamingSession {
  private ws: WebSocket | null = null;
  private readonly apiKey: string;
  private readonly options: STTOptions;
  private isConnected = false;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 3;

  constructor(apiKey: string, baseUrl: string, options: STTOptions) {
    super();
    this.apiKey = apiKey;
    this.options = options;
    
    this.connect(baseUrl);
  }

  /**
   * Connect to Deepgram WebSocket
   */
  private connect(baseUrl: string) {
    try {
      const params = new URLSearchParams({
        'model': this.options.model || 'nova-2',
        'language': this.options.language || 'en',
        'encoding': 'linear16',
        'sample_rate': (this.options.sampleRate || 16000).toString(),
        'channels': '1',
        'interim_results': 'true',
        'punctuate': 'true',
        'smart_format': 'true',
        'utterance_end_ms': '1000',
      });

      const wsUrl = `${baseUrl}?${params.toString()}`;
      
      this.ws = new WebSocket(wsUrl, {
        headers: {
          'Authorization': `Token ${this.apiKey}`,
        },
      });

      this.ws.on('open', () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        logger.debug('Deepgram WebSocket connected');
      });

      this.ws.on('message', (data) => {
        try {
          const response = JSON.parse(data.toString());
          this.handleMessage(response);
        } catch (error) {
          logger.error({ error }, 'Failed to parse Deepgram message');
        }
      });

      this.ws.on('error', (error) => {
        logger.error({ error }, 'Deepgram WebSocket error');
        this.emit('error', error);
      });

      this.ws.on('close', (code, reason) => {
        this.isConnected = false;
        logger.debug({ code, reason: reason.toString() }, 'Deepgram WebSocket closed');
        
        if (code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          logger.info({ attempt: this.reconnectAttempts }, 'Attempting to reconnect to Deepgram');
          
          setTimeout(() => {
            this.connect(baseUrl);
          }, 1000 * this.reconnectAttempts);
        } else {
          this.emit('close');
        }
      });

    } catch (error) {
      logger.error({ error }, 'Failed to connect to Deepgram');
      this.emit('error', error);
    }
  }

  /**
   * Handle incoming messages from Deepgram
   */
  private handleMessage(response: any) {
    if (response.type === 'Results' && response.channel?.alternatives?.length > 0) {
      const alternative = response.channel.alternatives[0];
      
      if (alternative.transcript) {
        const result: STTResult = {
          text: alternative.transcript,
          confidence: alternative.confidence || 0.9,
          language: this.options.language || 'en',
        };

        // Only emit final results for buffer transcription
        if (!response.is_final) {
          logger.debug({ text: result.text }, 'Deepgram interim result');
        } else {
          logger.debug({ text: result.text, confidence: result.confidence }, 'Deepgram final result');
          this.emit('transcript', result);
        }
      }
    } else if (response.type === 'Metadata') {
      logger.debug({ metadata: response }, 'Deepgram metadata received');
    } else if (response.type === 'SpeechStarted') {
      logger.debug('Deepgram speech started');
    } else if (response.type === 'UtteranceEnd') {
      logger.debug('Deepgram utterance ended');
    }
  }

  /**
   * Send audio data to Deepgram
   */
  sendAudio(chunk: Buffer): void {
    if (!this.isConnected || !this.ws) {
      logger.warn('Cannot send audio: WebSocket not connected');
      return;
    }

    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(chunk);
      logger.debug({ chunkSize: chunk.length }, 'Sent audio chunk to Deepgram');
    } else {
      logger.warn('Cannot send audio: WebSocket not ready');
    }
  }

  /**
   * Stop the streaming session
   */
  stop(): void {
    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN) {
        // Send close frame to indicate end of audio
        this.ws.send(JSON.stringify({ type: 'CloseStream' }));
        
        // Close WebSocket after a short delay
        setTimeout(() => {
          if (this.ws) {
            this.ws.close(1000, 'Session ended');
          }
        }, 100);
      } else {
        this.ws.close();
      }
      
      this.ws = null;
    }
    
    this.isConnected = false;
    logger.debug('Deepgram streaming session stopped');
  }
}
