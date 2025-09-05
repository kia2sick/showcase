import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import nock from 'nock';
import app from '../src/index.js';
import { sessionStore } from '../src/memory/session-store.js';

describe('Vapi Webhook', () => {
  beforeEach(() => {
    // Clean up sessions before each test
    const sessions = sessionStore.getActiveSessions();
    sessions.forEach(session => {
      sessionStore.delete(session.callId);
    });
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('POST /vapi/events', () => {
    it('should handle call.started event', async () => {
      const callStartedEvent = {
        type: 'call.started',
        callId: 'test-call-123',
        timestamp: new Date().toISOString(),
        call: {
          id: 'test-call-123',
          phoneNumber: '+1-555-0123',
          customer: {
            number: '+1-555-0123',
            name: 'Test Customer',
          },
          assistantId: 'test-assistant',
        },
      };

      const response = await request(app)
        .post('/vapi/events')
        .send(callStartedEvent)
        .expect(200);

      expect(response.body).toMatchObject({
        received: true,
      });

      // Check that session was created
      const session = sessionStore.get('test-call-123');
      expect(session).toBeDefined();
      expect(session?.callId).toBe('test-call-123');
      expect(session?.metadata?.customer?.name).toBe('Test Customer');
    });

    it('should handle asr.final event and generate response', async () => {
      // First create a session with call.started
      const callStartedEvent = {
        type: 'call.started',
        callId: 'test-call-456',
        call: {
          id: 'test-call-456',
          phoneNumber: '+1-555-0456',
        },
      };

      await request(app)
        .post('/vapi/events')
        .send(callStartedEvent)
        .expect(200);

      // Then send ASR final event
      const asrFinalEvent = {
        type: 'asr.final',
        callId: 'test-call-456',
        transcript: 'I would like to make a reservation for tonight',
        confidence: 0.95,
      };

      const response = await request(app)
        .post('/vapi/events')
        .send(asrFinalEvent)
        .expect(200);

      expect(response.body).toMatchObject({
        received: true,
      });

      // Check that transcript was added and response generated
      const session = sessionStore.get('test-call-456');
      expect(session).toBeDefined();
      expect(session?.transcript.length).toBeGreaterThan(1);
      
      const callerMessage = session?.transcript.find(t => t.who === 'caller');
      expect(callerMessage?.text).toBe('I would like to make a reservation for tonight');
      expect(callerMessage?.confidence).toBe(0.95);

      const agentMessage = session?.transcript.find(t => t.who === 'agent' && t.text !== session.transcript[0].text);
      expect(agentMessage).toBeDefined();
      expect(agentMessage?.text.length).toBeGreaterThan(0);
    });

    it('should handle call.ended event', async () => {
      // Create session first
      const callStartedEvent = {
        type: 'call.started',
        callId: 'test-call-789',
        call: { id: 'test-call-789' },
      };

      await request(app)
        .post('/vapi/events')
        .send(callStartedEvent);

      // End the call
      const callEndedEvent = {
        type: 'call.ended',
        callId: 'test-call-789',
        call: {
          id: 'test-call-789',
          duration: 120,
          endedReason: 'completed',
          cost: 0.05,
        },
      };

      const response = await request(app)
        .post('/vapi/events')
        .send(callEndedEvent)
        .expect(200);

      expect(response.body).toMatchObject({
        received: true,
      });

      // Check that session was deactivated
      const session = sessionStore.get('test-call-789');
      expect(session?.isActive).toBe(false);
    });

    it('should handle malformed webhook data gracefully', async () => {
      const malformedEvent = {
        type: 'unknown.event',
        // Missing required fields
      };

      const response = await request(app)
        .post('/vapi/events')
        .send(malformedEvent)
        .expect(200);

      expect(response.body).toMatchObject({
        received: true,
        error: 'Processing failed',
        message: expect.any(String),
      });
    });

    it('should process lead capture conversation', async () => {
      const callId = 'lead-test-call';
      
      // Start call
      await request(app)
        .post('/vapi/events')
        .send({
          type: 'call.started',
          callId,
          call: { id: callId },
        });

      // Customer asks for information
      await request(app)
        .post('/vapi/events')
        .send({
          type: 'asr.final',
          callId,
          transcript: 'I would like to learn more about your restaurant',
        });

      // Customer provides name
      await request(app)
        .post('/vapi/events')
        .send({
          type: 'asr.final',
          callId,
          transcript: 'My name is John Smith',
        });

      // Customer provides email
      await request(app)
        .post('/vapi/events')
        .send({
          type: 'asr.final',
          callId,
          transcript: 'My email is john.smith@email.com',
        });

      const session = sessionStore.get(callId);
      expect(session?.currentIntent).toBe('lead');
      expect(session?.collected.name).toBe('John Smith');
      expect(session?.collected.email).toBe('john.smith@email.com');
    });

    it('should process booking conversation', async () => {
      const callId = 'booking-test-call';
      
      // Start call
      await request(app)
        .post('/vapi/events')
        .send({
          type: 'call.started',
          callId,
          call: { id: callId },
        });

      // Customer wants reservation
      await request(app)
        .post('/vapi/events')
        .send({
          type: 'asr.final',
          callId,
          transcript: 'I would like to make a reservation for 4 people tonight at 7 PM',
        });

      // Customer provides name
      await request(app)
        .post('/vapi/events')
        .send({
          type: 'asr.final',
          callId,
          transcript: 'The name is Sarah Johnson',
        });

      const session = sessionStore.get(callId);
      expect(session?.currentIntent).toBe('booking');
      expect(session?.collected.name).toBe('Sarah Johnson');
      expect(session?.collected.partySize).toBe(4);
    });
  });

  describe('CRM Integration', () => {
    it('should create HubSpot contact for lead capture', async () => {
      // Mock HubSpot API
      const hubspotScope = nock('https://api.hubapi.com')
        .post('/crm/v3/objects/contacts/search')
        .reply(200, { results: [] })
        .post('/crm/v3/objects/contacts')
        .reply(200, { id: 'hubspot-contact-123' });

      const callId = 'hubspot-test-call';
      
      // Complete lead capture flow
      await request(app)
        .post('/vapi/events')
        .send({
          type: 'call.started',
          callId,
          call: { id: callId },
        });

      await request(app)
        .post('/vapi/events')
        .send({
          type: 'asr.final',
          callId,
          transcript: 'I need information about your services',
        });

      await request(app)
        .post('/vapi/events')
        .send({
          type: 'asr.final',
          callId,
          transcript: 'My name is Test User and email is test@example.com',
        });

      // Give time for async CRM operations
      await new Promise(resolve => setTimeout(resolve, 100));

      const session = sessionStore.get(callId);
      const hubspotActions = session?.crmActions.filter(a => a.type === 'hubspot_contact');
      
      // Should have attempted HubSpot contact creation
      expect(hubspotActions?.length).toBeGreaterThan(0);

      hubspotScope.done();
    });
  });
});
