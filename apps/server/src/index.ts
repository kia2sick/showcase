import express from 'express';
import { config, validateSTTConfig, validateTTSConfig, validateCRMConfig } from './utils/env.js';
import { serverLogger as logger } from './utils/logger.js';
import { healthCheck, detailedHealthCheck } from './routes/health.js';
import { handleVapiWebhook } from './routes/vapi-webhook.js';
import { getDashboard, getCallDetails, initiateCall, getCallLogs, getAnalytics, startBulkCampaign, getCampaignStatus, listCampaigns, generateSampleCsv } from './routes/admin.js';
import { createBusiness, getBusinesses, getBusinessDetails, assignPhoneNumber, initiateBusinessCall, getPlatformStats, quickSetup } from './routes/business.js';

// Validate configuration on startup
try {
  validateSTTConfig();
  validateTTSConfig();
  validateCRMConfig();
  logger.info('Configuration validation passed');
} catch (error) {
  logger.error({ error }, 'Configuration validation failed');
  process.exit(1);
}

// Create Express app
const app = express();

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static files (admin dashboard)
app.use('/admin', express.static('public'));

// Add request logging middleware
app.use((req, res, next) => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.info({
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
    }, 'HTTP request completed');
  });
  
  next();
});

// Routes
app.get('/health', healthCheck);
app.get('/health/detailed', detailedHealthCheck);
app.post('/vapi/events', handleVapiWebhook);

// Admin Dashboard API Routes
app.get('/admin/dashboard', getDashboard);
app.get('/admin/calls/:callId', getCallDetails);
app.post('/admin/calls/initiate', initiateCall);
app.get('/admin/logs', getCallLogs);
app.get('/admin/analytics', getAnalytics);

// Bulk Calling Routes
app.post('/admin/bulk-campaign', startBulkCampaign);
app.get('/admin/campaigns', listCampaigns);
app.get('/admin/campaigns/:campaignId', getCampaignStatus);
app.get('/admin/sample-csv', generateSampleCsv);

// Business Management API Routes (SaaS Platform)
app.post('/api/businesses', createBusiness);
app.get('/api/businesses', getBusinesses);
app.get('/api/businesses/:businessId', getBusinessDetails);
app.post('/api/businesses/:businessId/phone-numbers', assignPhoneNumber);
app.post('/api/businesses/:businessId/calls', initiateBusinessCall);
app.get('/api/platform/stats', getPlatformStats);
app.post('/api/quick-setup', quickSetup);

// Test webhook endpoint
app.post('/vapi/test', (req, res) => {
  console.log('\n🧪 === WEBHOOK TEST ===');
  console.log('✅ Webhook endpoint is working!');
  console.log('📋 Received body:', JSON.stringify(req.body, null, 2));
  console.log('🌐 From IP:', req.ip);
  console.log('=====================\n');
  
  res.json({ 
    success: true, 
    message: 'Webhook test successful!',
    timestamp: new Date().toISOString(),
    receivedData: req.body 
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Voice AI Agent Server',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/health',
      detailedHealth: '/health/detailed',
      vapiWebhook: '/vapi/events',
      adminDashboard: '/admin/admin.html',
      adminAPI: '/admin/dashboard',
    },
    services: {
      stt: config.STT_PROVIDER,
      tts: 'elevenlabs',
      environment: config.NODE_ENV,
    },
  });
});

// 404 handler
app.use((req, res) => {
  logger.warn({
    method: req.method,
    url: req.url,
    ip: req.ip,
  }, '404 - Route not found');
  
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.url} not found`,
    timestamp: new Date().toISOString(),
  });
});

// Error handler
app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error({
    error: error.message,
    stack: error.stack,
    method: req.method,
    url: req.url,
    ip: req.ip,
  }, 'Unhandled error');

  res.status(500).json({
    error: 'Internal Server Error',
    message: config.NODE_ENV === 'development' ? error.message : 'Something went wrong',
    timestamp: new Date().toISOString(),
  });
});

// Graceful shutdown handling
function gracefulShutdown(signal: string) {
  logger.info({ signal }, 'Received shutdown signal');
  
  server.close(() => {
    logger.info('HTTP server closed');
    
    // Cleanup resources
    try {
      // Import and shutdown services that need cleanup
      import('./memory/session-store.js').then(({ sessionStore }) => {
        sessionStore.shutdown();
      });
      
      import('./state/menu.js').then(({ menuState }) => {
        menuState.shutdown();
      });
      
      import('./state/availability.js').then(({ availabilityState }) => {
        availabilityState.shutdown();
      });
      
      logger.info('Cleanup completed');
    } catch (error) {
      logger.error({ error }, 'Error during cleanup');
    }
    
    process.exit(0);
  });
}

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.fatal({ error }, 'Uncaught exception');
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.fatal({ reason, promise }, 'Unhandled promise rejection');
  process.exit(1);
});

// Start server
const server = app.listen(config.PORT, () => {
  logger.info({
    port: config.PORT,
    environment: config.NODE_ENV,
    nodeVersion: process.version,
    pid: process.pid,
  }, 'Voice AI Agent Server started');
  
  logger.info({
    sttProvider: config.STT_PROVIDER,
    ttsProvider: 'elevenlabs',
    hubspotConfigured: !!config.HUBSPOT_PRIVATE_APP_TOKEN,
    airtableConfigured: !!(config.AIRTABLE_API_KEY && config.AIRTABLE_BASE_ID),
    vapiConfigured: !!config.VAPI_API_KEY,
    outboundEnabled: config.VAPI_OUTBOUND_ENABLED,
  }, 'Service configuration');
});

export default app;
