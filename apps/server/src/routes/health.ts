import { Request, Response } from 'express';
import { config } from '../utils/env.js';
import { hubspotService } from '../services/hubspot.js';
import { airtableService } from '../services/airtable.js';
import { vapiService } from '../services/vapi.js';
import { sessionStore } from '../memory/session-store.js';
import { menuState } from '../state/menu.js';
import { availabilityState } from '../state/availability.js';
import { serverLogger as logger } from '../utils/logger.js';

/**
 * Health check endpoint
 * Returns system status and service availability
 */
export async function healthCheck(req: Request, res: Response) {
  try {
    logger.debug('Health check requested');

    const startTime = Date.now();
    
    // Basic system info
    const systemInfo = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      nodeVersion: process.version,
      environment: config.NODE_ENV,
    };

    // Service configurations
    const serviceConfig = {
      stt: config.STT_PROVIDER,
      tts: 'elevenlabs',
      hubspot: hubspotService.isConfigured(),
      airtable: airtableService.isConfigured(),
      vapi: vapiService.isConfigured(),
      outboundEnabled: vapiService.isOutboundEnabled(),
    };

    // Memory and state info
    const memoryInfo = {
      sessions: sessionStore.getStats(),
      menu: menuState.getCacheInfo(),
      availability: availabilityState.getStats(),
    };

    // Perform service health checks (non-blocking)
    const serviceHealth = await Promise.allSettled([
      hubspotService.healthCheck().catch(() => false),
      airtableService.healthCheck().catch(() => false),
      vapiService.healthCheck().catch(() => false),
    ]);

    const healthResults = {
      hubspot: serviceHealth[0].status === 'fulfilled' ? serviceHealth[0].value : false,
      airtable: serviceHealth[1].status === 'fulfilled' ? serviceHealth[1].value : false,
      vapi: serviceHealth[2].status === 'fulfilled' ? serviceHealth[2].value : false,
    };

    const responseTime = Date.now() - startTime;

    const healthData = {
      ...systemInfo,
      services: {
        config: serviceConfig,
        health: healthResults,
      },
      memory: memoryInfo,
      performance: {
        responseTime,
      },
    };

    logger.info({
      responseTime,
      activeServices: Object.entries(serviceConfig).filter(([_, enabled]) => enabled).map(([name]) => name),
    }, 'Health check completed');

    res.status(200).json(healthData);

  } catch (error) {
    logger.error({ error }, 'Health check failed');
    
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: 'Health check failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Detailed health check with service tests
 */
export async function detailedHealthCheck(req: Request, res: Response) {
  try {
    logger.debug('Detailed health check requested');

    const startTime = Date.now();
    const results: any = {
      timestamp: new Date().toISOString(),
      services: {},
    };

    // Test each service individually
    if (hubspotService.isConfigured()) {
      try {
        const hubspotStart = Date.now();
        const accountInfo = await hubspotService.getAccountInfo();
        results.services.hubspot = {
          status: 'ok',
          configured: true,
          responseTime: Date.now() - hubspotStart,
          accountInfo: accountInfo ? { portalId: accountInfo.portalId } : null,
        };
      } catch (error) {
        results.services.hubspot = {
          status: 'error',
          configured: true,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    } else {
      results.services.hubspot = {
        status: 'disabled',
        configured: false,
      };
    }

    if (airtableService.isConfigured()) {
      try {
        const airtableStart = Date.now();
        await airtableService.listReservations({ maxRecords: 1 });
        results.services.airtable = {
          status: 'ok',
          configured: true,
          responseTime: Date.now() - airtableStart,
        };
      } catch (error) {
        results.services.airtable = {
          status: 'error',
          configured: true,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    } else {
      results.services.airtable = {
        status: 'disabled',
        configured: false,
      };
    }

    if (vapiService.isConfigured()) {
      try {
        const vapiStart = Date.now();
        await vapiService.listAssistants();
        results.services.vapi = {
          status: 'ok',
          configured: true,
          responseTime: Date.now() - vapiStart,
          outboundEnabled: vapiService.isOutboundEnabled(),
        };
      } catch (error) {
        results.services.vapi = {
          status: 'error',
          configured: true,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    } else {
      results.services.vapi = {
        status: 'disabled',
        configured: false,
      };
    }

    results.totalResponseTime = Date.now() - startTime;
    results.status = Object.values(results.services).some((service: any) => service.status === 'error') 
      ? 'degraded' 
      : 'ok';

    logger.info({
      status: results.status,
      totalResponseTime: results.totalResponseTime,
    }, 'Detailed health check completed');

    res.status(200).json(results);

  } catch (error) {
    logger.error({ error }, 'Detailed health check failed');
    
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: 'Detailed health check failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
