import FormData from 'form-data';
import { STTService, STTOptions, STTResult } from '../../types/services.js';
import { openaiClient, httpWithRetry } from '../../utils/http.js';
import { config } from '../../utils/env.js';
import { sttLogger as logger } from '../../utils/logger.js';

/**
 * OpenAI Whisper STT Service
 * Supports audio file transcription via REST API
 */
export class WhisperSTTService implements STTService {
  private readonly apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || config.OPENAI_API_KEY || '';
    
    if (!this.apiKey) {
      throw new Error('OpenAI API key is required for Whisper STT service');
    }

    logger.info('Whisper STT service initialized');
  }

  /**
   * Transcribe audio buffer using OpenAI Whisper
   */
  async transcribeBuffer(audioBuffer: Buffer, options: STTOptions = {}): Promise<STTResult> {
    const startTime = Date.now();
    
    try {
      logger.debug({ 
        bufferSize: audioBuffer.length,
        options 
      }, 'Starting Whisper transcription');

      // Create form data for multipart upload
      const formData = new FormData();
      formData.append('file', audioBuffer, {
        filename: 'audio.wav',
        contentType: 'audio/wav',
      });
      formData.append('model', options.model || 'whisper-1');
      
      if (options.language) {
        formData.append('language', options.language);
      }

      // Set response format to verbose JSON for confidence scores
      formData.append('response_format', 'verbose_json');

      const response = await httpWithRetry(openaiClient, {
        method: 'POST',
        url: '/audio/transcriptions',
        data: formData,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          ...formData.getHeaders(),
        },
        timeout: 30000, // 30 second timeout for audio processing
      });

      const duration = Date.now() - startTime;
      const result = response.data;

      // Extract confidence from segments if available
      let confidence = 0.95; // Default confidence for Whisper
      if (result.segments && result.segments.length > 0) {
        const avgConfidence = result.segments.reduce((sum: number, segment: any) => {
          return sum + (segment.avg_logprob || -0.5);
        }, 0) / result.segments.length;
        
        // Convert log probability to confidence (rough approximation)
        confidence = Math.max(0, Math.min(1, (avgConfidence + 1) / 2));
      }

      const sttResult: STTResult = {
        text: result.text.trim(),
        confidence,
        language: result.language,
        duration: result.duration,
      };

      logger.info({
        text: sttResult.text,
        confidence: sttResult.confidence,
        language: sttResult.language,
        processingTime: duration,
        audioLength: result.duration,
      }, 'Whisper transcription completed');

      return sttResult;

    } catch (error: any) {
      const duration = Date.now() - startTime;
      
      logger.error({
        error: error.message,
        status: error.response?.status,
        processingTime: duration,
      }, 'Whisper transcription failed');

      throw new Error(`Whisper transcription failed: ${error.message}`);
    }
  }

  /**
   * Whisper doesn't support streaming via REST API
   * This is a placeholder for potential future streaming support
   */
  startStreaming(options: STTOptions = {}) {
    logger.warn('Whisper REST API does not support streaming. Use Deepgram for streaming STT.');
    
    throw new Error('Streaming not supported by Whisper REST API. Use Deepgram for streaming STT.');
  }

  /**
   * Validate audio format and size
   */
  private validateAudioBuffer(buffer: Buffer): void {
    if (!buffer || buffer.length === 0) {
      throw new Error('Audio buffer is empty');
    }

    // OpenAI has a 25MB limit for audio files
    const maxSize = 25 * 1024 * 1024; // 25MB
    if (buffer.length > maxSize) {
      throw new Error(`Audio file too large: ${buffer.length} bytes (max: ${maxSize} bytes)`);
    }

    logger.debug({ bufferSize: buffer.length }, 'Audio buffer validated');
  }

  /**
   * Get service info
   */
  getServiceInfo() {
    return {
      provider: 'openai',
      service: 'whisper',
      model: 'whisper-1',
      supportsStreaming: false,
      maxFileSize: '25MB',
      supportedFormats: ['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm'],
    };
  }
}
