import { Request, Response } from 'express';
import { sessionStore } from '../memory/session-store.js';
import { vapiService } from '../services/vapi.js';
import { config } from '../utils/env.js';
import { serverLogger as logger } from '../utils/logger.js';
import { forLogging } from '../utils/redact.js';

/**
 * Admin Dashboard API Routes
 * Real-time monitoring and call management
 */

/**
 * Get real-time dashboard data
 */
export async function getDashboard(req: Request, res: Response) {
  try {
    const stats = sessionStore.getStats();
    const activeSessions = sessionStore.getActiveSessions();
    
    // Enhanced session data for dashboard
    const activeCallsData = activeSessions.map(session => ({
      callId: session.callId,
      startTime: new Date(session.createdAt).toISOString(),
      duration: Math.round((Date.now() - session.createdAt) / 1000),
      intent: session.currentIntent || 'detecting',
      customerPhone: session.metadata?.customer?.number || 'unknown',
      customerName: session.collected.name || 'unknown',
      lastActivity: new Date(session.lastActivity).toISOString(),
      transcriptLength: session.transcript.length,
      dataCollected: Object.keys(session.collected).filter(key => session.collected[key]).length,
      crmActions: session.crmActions.length,
      status: session.isActive ? 'active' : 'ended'
    }));

    const dashboardData = {
      timestamp: new Date().toISOString(),
      stats: {
        ...stats,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
      },
      activeCalls: activeCallsData,
      systemHealth: {
        vapi: vapiService.isConfigured(),
        outboundEnabled: vapiService.isOutboundEnabled(),
        environment: config.NODE_ENV,
      }
    };

    res.json(dashboardData);
    
    logger.debug({
      concurrentCalls: stats.concurrent,
      totalSessions: stats.total,
    }, 'Dashboard data requested');

  } catch (error) {
    logger.error({ error }, 'Dashboard data fetch failed');
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
}

/**
 * Get detailed call information
 */
export async function getCallDetails(req: Request, res: Response) {
  try {
    const { callId } = req.params;
    const session = sessionStore.get(callId);

    if (!session) {
      return res.status(404).json({ error: 'Call not found' });
    }

    const callDetails = {
      callId: session.callId,
      startTime: new Date(session.createdAt).toISOString(),
      endTime: session.isActive ? null : new Date(session.lastActivity).toISOString(),
      duration: Math.round((session.lastActivity - session.createdAt) / 1000),
      status: session.isActive ? 'active' : 'ended',
      intent: session.currentIntent,
      customer: {
        name: session.collected.name,
        email: session.collected.email,
        phone: session.collected.phone || session.metadata?.customer?.number,
      },
      conversation: {
        transcript: session.transcript.map(entry => ({
          who: entry.who,
          text: entry.text,
          timestamp: new Date(entry.timestamp).toISOString(),
          confidence: entry.confidence,
        })),
        totalExchanges: session.transcript.length,
      },
      dataCollection: {
        collected: forLogging(session.collected),
        completeness: calculateCompleteness(session),
      },
      crmActions: session.crmActions.map(action => ({
        type: action.type,
        status: action.status,
        timestamp: new Date(action.timestamp).toISOString(),
        error: action.error,
      })),
      metadata: forLogging(session.metadata),
    };

    res.json(callDetails);

  } catch (error) {
    logger.error({ error, callId: req.params.callId }, 'Call details fetch failed');
    res.status(500).json({ error: 'Failed to fetch call details' });
  }
}

/**
 * Initiate outbound call
 */
export async function initiateCall(req: Request, res: Response) {
  try {
    if (!vapiService.isOutboundEnabled()) {
      return res.status(400).json({ 
        error: 'Outbound calling not enabled',
        message: 'Configure VAPI_OUTBOUND_ENABLED and required credentials'
      });
    }

    const { phoneNumber, assistantId, metadata } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    const callRequest = {
      assistantId: assistantId || config.VAPI_ASSISTANT_ID!,
      phoneNumber,
      customer: {
        number: phoneNumber,
        name: metadata?.customerName || 'Admin Initiated Call',
      },
      metadata: {
        ...metadata,
        initiatedBy: 'admin',
        timestamp: new Date().toISOString(),
      },
    };

    const result = await vapiService.createOutboundCall(callRequest);

    logger.info({
      callId: result.id,
      phoneNumber,
      initiatedBy: 'admin',
    }, 'Outbound call initiated from admin');

    res.json({
      success: true,
      callId: result.id,
      phoneNumber,
      status: result.status || 'initiated',
      message: 'Call initiated successfully',
    });

  } catch (error) {
    logger.error({ error, body: req.body }, 'Outbound call initiation failed');
    res.status(500).json({ 
      error: 'Failed to initiate call',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Get call logs with pagination
 */
export async function getCallLogs(req: Request, res: Response) {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const status = req.query.status as string; // 'active' | 'ended'
    const intent = req.query.intent as string;

    let sessions = Array.from(sessionStore.getActiveSessions());
    
    // Add ended sessions (in a real app, these would come from a database)
    const allSessions = Array.from(sessionStore['sessions'].values());
    sessions = allSessions;

    // Apply filters
    if (status) {
      sessions = sessions.filter(s => 
        status === 'active' ? s.isActive : !s.isActive
      );
    }

    if (intent) {
      sessions = sessions.filter(s => s.currentIntent === intent);
    }

    // Sort by creation time (newest first)
    sessions.sort((a, b) => b.createdAt - a.createdAt);

    // Pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedSessions = sessions.slice(startIndex, endIndex);

    const logs = paginatedSessions.map(session => ({
      callId: session.callId,
      startTime: new Date(session.createdAt).toISOString(),
      endTime: session.isActive ? null : new Date(session.lastActivity).toISOString(),
      duration: Math.round((session.lastActivity - session.createdAt) / 1000),
      status: session.isActive ? 'active' : 'ended',
      intent: session.currentIntent || 'unknown',
      customerName: session.collected.name || 'unknown',
      customerPhone: session.metadata?.customer?.number || 'unknown',
      transcriptLength: session.transcript.length,
      crmActionsCount: session.crmActions.length,
      successfulCrmActions: session.crmActions.filter(a => a.status === 'success').length,
    }));

    res.json({
      logs,
      pagination: {
        page,
        limit,
        total: sessions.length,
        pages: Math.ceil(sessions.length / limit),
        hasNext: endIndex < sessions.length,
        hasPrev: page > 1,
      },
      filters: {
        status,
        intent,
      }
    });

  } catch (error) {
    logger.error({ error }, 'Call logs fetch failed');
    res.status(500).json({ error: 'Failed to fetch call logs' });
  }
}

/**
 * Get analytics data
 */
export async function getAnalytics(req: Request, res: Response) {
  try {
    const timeframe = req.query.timeframe as string || '24h'; // 1h, 24h, 7d, 30d
    const now = Date.now();
    
    let cutoffTime: number;
    switch (timeframe) {
      case '1h': cutoffTime = now - (60 * 60 * 1000); break;
      case '24h': cutoffTime = now - (24 * 60 * 60 * 1000); break;
      case '7d': cutoffTime = now - (7 * 24 * 60 * 60 * 1000); break;
      case '30d': cutoffTime = now - (30 * 24 * 60 * 60 * 1000); break;
      default: cutoffTime = now - (24 * 60 * 60 * 1000);
    }

    const sessions = Array.from(sessionStore['sessions'].values())
      .filter(s => s.createdAt >= cutoffTime);

    const analytics = {
      timeframe,
      period: {
        start: new Date(cutoffTime).toISOString(),
        end: new Date(now).toISOString(),
      },
      totals: {
        calls: sessions.length,
        completedCalls: sessions.filter(s => !s.isActive).length,
        activeCalls: sessions.filter(s => s.isActive).length,
        avgDuration: sessions.length > 0 
          ? Math.round(sessions.reduce((sum, s) => sum + (s.lastActivity - s.createdAt), 0) / sessions.length / 1000)
          : 0,
      },
      intents: {
        lead: sessions.filter(s => s.currentIntent === 'lead').length,
        booking: sessions.filter(s => s.currentIntent === 'booking').length,
        menu: sessions.filter(s => s.currentIntent === 'menu').length,
        unknown: sessions.filter(s => !s.currentIntent).length,
      },
      success: {
        totalCrmActions: sessions.reduce((sum, s) => sum + s.crmActions.length, 0),
        successfulCrmActions: sessions.reduce((sum, s) => 
          sum + s.crmActions.filter(a => a.status === 'success').length, 0),
        conversionRate: sessions.length > 0 
          ? Math.round((sessions.filter(s => s.crmActions.some(a => a.status === 'success')).length / sessions.length) * 100)
          : 0,
      },
    };

    res.json(analytics);

  } catch (error) {
    logger.error({ error }, 'Analytics fetch failed');
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
}

/**
 * Calculate data completeness for a session
 */
function calculateCompleteness(session: any): number {
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
