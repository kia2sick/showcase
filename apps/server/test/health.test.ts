import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/index.js';

describe('Health Endpoints', () => {
  let server: any;

  beforeAll(() => {
    // Start server for testing
    server = app.listen(0); // Use random port
  });

  afterAll(() => {
    if (server) {
      server.close();
    }
  });

  describe('GET /health', () => {
    it('should return 200 with basic health info', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'ok',
        timestamp: expect.any(String),
        uptime: expect.any(Number),
        nodeVersion: expect.any(String),
        environment: expect.any(String),
      });

      expect(response.body.services).toBeDefined();
      expect(response.body.memory).toBeDefined();
      expect(response.body.performance).toBeDefined();
    });

    it('should include service configuration', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.services.config).toMatchObject({
        stt: expect.any(String),
        tts: 'elevenlabs',
        hubspot: expect.any(Boolean),
        airtable: expect.any(Boolean),
        vapi: expect.any(Boolean),
        outboundEnabled: expect.any(Boolean),
      });
    });

    it('should include memory information', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.memory).toMatchObject({
        sessions: expect.objectContaining({
          total: expect.any(Number),
          active: expect.any(Number),
          inactive: expect.any(Number),
        }),
        menu: expect.any(Object),
        availability: expect.any(Object),
      });
    });
  });

  describe('GET /health/detailed', () => {
    it('should return detailed health information', async () => {
      const response = await request(app)
        .get('/health/detailed')
        .expect(200);

      expect(response.body).toMatchObject({
        timestamp: expect.any(String),
        status: expect.stringMatching(/^(ok|degraded|error)$/),
        services: expect.any(Object),
        totalResponseTime: expect.any(Number),
      });
    });

    it('should test individual services', async () => {
      const response = await request(app)
        .get('/health/detailed')
        .expect(200);

      const services = response.body.services;
      
      // Should have service status for each configured service
      expect(services.hubspot).toMatchObject({
        status: expect.stringMatching(/^(ok|error|disabled)$/),
        configured: expect.any(Boolean),
      });

      expect(services.airtable).toMatchObject({
        status: expect.stringMatching(/^(ok|error|disabled)$/),
        configured: expect.any(Boolean),
      });

      expect(services.vapi).toMatchObject({
        status: expect.stringMatching(/^(ok|error|disabled)$/),
        configured: expect.any(Boolean),
      });
    });
  });

  describe('GET /', () => {
    it('should return basic server info', async () => {
      const response = await request(app)
        .get('/')
        .expect(200);

      expect(response.body).toMatchObject({
        name: 'Voice AI Agent Server',
        version: '1.0.0',
        status: 'running',
        timestamp: expect.any(String),
        endpoints: expect.any(Object),
        services: expect.any(Object),
      });
    });
  });

  describe('404 handling', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await request(app)
        .get('/unknown-route')
        .expect(404);

      expect(response.body).toMatchObject({
        error: 'Not Found',
        message: expect.stringContaining('/unknown-route'),
        timestamp: expect.any(String),
      });
    });
  });
});
