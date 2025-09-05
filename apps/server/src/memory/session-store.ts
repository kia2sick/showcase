import { SessionState, ExtendedSession, CollectedData, TranscriptEntry, CRMAction } from '../types/session.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('session-store');

/**
 * In-memory session store
 * TODO: Replace with Redis for production scalability
 */
class SessionStore {
  private sessions = new Map<string, ExtendedSession>();
  private cleanupInterval: NodeJS.Timeout;

  constructor(cleanupIntervalMs = 30 * 60 * 1000) { // 30 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, cleanupIntervalMs);

    logger.info('Session store initialized with in-memory storage');
  }

  /**
   * Create a new session
   */
  create(callId: string, metadata?: Record<string, any>): ExtendedSession {
    const now = Date.now();
    const session: ExtendedSession = {
      callId,
      createdAt: now,
      lastActivity: now,
      collected: {},
      transcript: [],
      crmActions: [],
      isActive: true,
      metadata,
    };

    this.sessions.set(callId, session);
    logger.debug({ callId }, 'Created new session');
    
    return session;
  }

  /**
   * Get session by call ID
   */
  get(callId: string): ExtendedSession | undefined {
    return this.sessions.get(callId);
  }

  /**
   * Update session
   */
  update(callId: string, updates: Partial<ExtendedSession>): ExtendedSession | undefined {
    const session = this.sessions.get(callId);
    if (!session) {
      logger.warn({ callId }, 'Attempted to update non-existent session');
      return undefined;
    }

    const updatedSession = {
      ...session,
      ...updates,
      lastActivity: Date.now(),
    };

    this.sessions.set(callId, updatedSession);
    logger.debug({ callId, updates: Object.keys(updates) }, 'Updated session');
    
    return updatedSession;
  }

  /**
   * Update collected data
   */
  updateCollected(callId: string, data: Partial<CollectedData>): ExtendedSession | undefined {
    const session = this.sessions.get(callId);
    if (!session) {
      return undefined;
    }

    const updatedCollected = {
      ...session.collected,
      ...data,
    };

    return this.update(callId, { collected: updatedCollected });
  }

  /**
   * Add transcript entry
   */
  addTranscript(callId: string, entry: TranscriptEntry): ExtendedSession | undefined {
    const session = this.sessions.get(callId);
    if (!session) {
      return undefined;
    }

    const updatedTranscript = [...session.transcript, entry];
    return this.update(callId, { transcript: updatedTranscript });
  }

  /**
   * Add CRM action
   */
  addCRMAction(callId: string, action: CRMAction): ExtendedSession | undefined {
    const session = this.sessions.get(callId);
    if (!session) {
      return undefined;
    }

    const updatedActions = [...session.crmActions, action];
    return this.update(callId, { crmActions: updatedActions });
  }

  /**
   * Update CRM action status
   */
  updateCRMAction(callId: string, idempotencyKey: string, updates: Partial<CRMAction>): ExtendedSession | undefined {
    const session = this.sessions.get(callId);
    if (!session) {
      return undefined;
    }

    const actionIndex = session.crmActions.findIndex(a => a.idempotencyKey === idempotencyKey);
    if (actionIndex === -1) {
      logger.warn({ callId, idempotencyKey }, 'CRM action not found for update');
      return session;
    }

    const updatedActions = [...session.crmActions];
    updatedActions[actionIndex] = {
      ...updatedActions[actionIndex],
      ...updates,
    };

    return this.update(callId, { crmActions: updatedActions });
  }

  /**
   * Mark session as inactive
   */
  deactivate(callId: string): ExtendedSession | undefined {
    return this.update(callId, { isActive: false });
  }

  /**
   * Delete session
   */
  delete(callId: string): boolean {
    const deleted = this.sessions.delete(callId);
    if (deleted) {
      logger.debug({ callId }, 'Deleted session');
    }
    return deleted;
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): ExtendedSession[] {
    return Array.from(this.sessions.values()).filter(s => s.isActive);
  }

  /**
   * Get session statistics
   */
  getStats() {
    const sessions = Array.from(this.sessions.values());
    const active = sessions.filter(s => s.isActive).length;
    const inactive = sessions.length - active;
    
    // Enhanced stats for concurrent monitoring
    const byIntent = {
      lead: sessions.filter(s => s.currentIntent === 'lead').length,
      booking: sessions.filter(s => s.currentIntent === 'booking').length,
      menu: sessions.filter(s => s.currentIntent === 'menu').length,
      unknown: sessions.filter(s => !s.currentIntent).length,
    };

    const avgDuration = sessions.length > 0 
      ? sessions.reduce((sum, s) => sum + (Date.now() - s.createdAt), 0) / sessions.length / 1000 
      : 0;
    
    return {
      total: sessions.length,
      active,
      inactive,
      concurrent: active, // Current concurrent calls
      byIntent,
      avgDurationSeconds: Math.round(avgDuration),
      oldestSession: sessions.length > 0 ? Math.min(...sessions.map(s => s.createdAt)) : null,
    };
  }

  /**
   * Get active sessions for monitoring
   */
  getActiveSessions(): ExtendedSession[] {
    return Array.from(this.sessions.values()).filter(s => s.isActive);
  }

  /**
   * Get session by phone number
   */
  getSessionByPhone(phoneNumber: string): ExtendedSession | undefined {
    return Array.from(this.sessions.values()).find(
      session => session.metadata?.customer?.number === phoneNumber || 
                session.metadata?.phoneNumber === phoneNumber
    );
  }

  /**
   * Cleanup old inactive sessions
   */
  private cleanup() {
    const cutoffTime = Date.now() - (24 * 60 * 60 * 1000); // 24 hours
    let cleaned = 0;

    for (const [callId, session] of this.sessions.entries()) {
      if (!session.isActive && session.lastActivity < cutoffTime) {
        this.sessions.delete(callId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info({ cleaned }, 'Cleaned up old sessions');
    }
  }

  /**
   * Shutdown and cleanup
   */
  shutdown() {
    clearInterval(this.cleanupInterval);
    logger.info('Session store shutdown');
  }
}

// Singleton instance
export const sessionStore = new SessionStore();

// Export for testing
export { SessionStore };
