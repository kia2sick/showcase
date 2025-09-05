import { TTSService, TTSOptions, TTSResult } from '../../types/services.js';
import { elevenlabsClient, httpWithRetry } from '../../utils/http.js';
import { config } from '../../utils/env.js';
import { ttsLogger as logger } from '../../utils/logger.js';

/**
 * ElevenLabs TTS Service
 * High-quality text-to-speech synthesis
 */
export class ElevenLabsTTSService implements TTSService {
  private readonly apiKey: string;
  private readonly defaultVoiceId: string;

  constructor(apiKey?: string, defaultVoiceId?: string) {
    this.apiKey = apiKey || config.ELEVEN_API_KEY || '';
    this.defaultVoiceId = defaultVoiceId || config.ELEVEN_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL'; // Default Bella voice
    
    if (!this.apiKey) {
      throw new Error('ElevenLabs API key is required for TTS service');
    }

    logger.info({ defaultVoiceId: this.defaultVoiceId }, 'ElevenLabs TTS service initialized');
  }

  /**
   * Synthesize text to speech
   */
  async synthesize(text: string, options: TTSOptions = {}): Promise<TTSResult> {
    const startTime = Date.now();
    
    try {
      logger.debug({ 
        text: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
        options 
      }, 'Starting ElevenLabs synthesis');

      const voiceId = options.voiceId || this.defaultVoiceId;
      const requestBody = {
        text,
        model_id: 'eleven_monolingual_v1', // Fast, good quality model
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true,
        },
      };

      // Apply speed adjustment if specified
      if (options.speed && options.speed !== 1.0) {
        // ElevenLabs doesn't have direct speed control, but we can adjust via voice settings
        requestBody.voice_settings.stability = Math.max(0.1, Math.min(1.0, 0.5 / options.speed));
      }

      const response = await httpWithRetry(elevenlabsClient, {
        method: 'POST',
        url: `/text-to-speech/${voiceId}`,
        data: requestBody,
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': this.apiKey,
        },
        responseType: 'arraybuffer',
        timeout: 30000, // 30 second timeout
      });

      const duration = Date.now() - startTime;
      const audioBuffer = Buffer.from(response.data);

      const result: TTSResult = {
        audio: audioBuffer,
        format: 'mp3',
        duration: this.estimateAudioDuration(audioBuffer, text),
      };

      logger.info({
        textLength: text.length,
        audioSize: audioBuffer.length,
        processingTime: duration,
        estimatedDuration: result.duration,
        voiceId,
      }, 'ElevenLabs synthesis completed');

      return result;

    } catch (error: any) {
      const duration = Date.now() - startTime;
      
      logger.error({
        error: error.message,
        status: error.response?.status,
        processingTime: duration,
        textLength: text.length,
      }, 'ElevenLabs synthesis failed');

      throw new Error(`ElevenLabs synthesis failed: ${error.message}`);
    }
  }

  /**
   * Get available voices
   */
  async getVoices(): Promise<any[]> {
    try {
      const response = await httpWithRetry(elevenlabsClient, {
        method: 'GET',
        url: '/voices',
        headers: {
          'xi-api-key': this.apiKey,
        },
      });

      return response.data.voices || [];
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to fetch voices');
      return [];
    }
  }

  /**
   * Get user info and usage
   */
  async getUserInfo(): Promise<any> {
    try {
      const response = await httpWithRetry(elevenlabsClient, {
        method: 'GET',
        url: '/user',
        headers: {
          'xi-api-key': this.apiKey,
        },
      });

      return response.data;
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to fetch user info');
      return null;
    }
  }

  /**
   * Estimate audio duration based on text length and average speaking rate
   * This is a rough approximation
   */
  private estimateAudioDuration(audioBuffer: Buffer, text: string): number {
    // Average speaking rate: ~150 words per minute
    // Average word length: ~5 characters
    const wordsPerMinute = 150;
    const avgWordLength = 5;
    const estimatedWords = text.length / avgWordLength;
    const estimatedMinutes = estimatedWords / wordsPerMinute;
    
    return Math.max(1, Math.round(estimatedMinutes * 60)); // Return seconds, minimum 1
  }

  /**
   * Validate text input
   */
  private validateText(text: string): void {
    if (!text || text.trim().length === 0) {
      throw new Error('Text cannot be empty');
    }

    // ElevenLabs has a character limit
    const maxLength = 5000;
    if (text.length > maxLength) {
      throw new Error(`Text too long: ${text.length} characters (max: ${maxLength})`);
    }

    logger.debug({ textLength: text.length }, 'Text validated');
  }

  /**
   * Get service info
   */
  getServiceInfo() {
    return {
      provider: 'elevenlabs',
      defaultVoiceId: this.defaultVoiceId,
      maxTextLength: 5000,
      supportedFormats: ['mp3'],
      features: ['voice_cloning', 'multiple_languages', 'emotion_control'],
    };
  }

  /**
   * Check if service is configured and accessible
   */
  async healthCheck(): Promise<boolean> {
    try {
      const userInfo = await this.getUserInfo();
      return !!userInfo;
    } catch (error) {
      return false;
    }
  }
}
