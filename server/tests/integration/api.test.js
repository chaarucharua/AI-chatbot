import 'dotenv/config';
import request from 'supertest';
import app from '../../src/app.js';
import { closeDatabase } from '../../src/config/database.js';

describe('NovaCart API Integration Tests', () => {
  let customerToken = '';
  let customerId = '';
  let conversationId = '';

  afterAll(async () => {
    await closeDatabase();
  });

  test('GET /api/health returns 200 with service checks', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBeDefined();
    expect(res.body.data.services.database.status).toBe('ok');
  });

  test('POST /api/auth/login authenticates test customer', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'customer@novacart.com',
        password: 'CustomerPass123!',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user.email).toBe('customer@novacart.com');

    customerToken = res.body.data.token;
    customerId = res.body.data.user.id;
  });

  test('GET /api/auth/me returns profile with valid Bearer token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(customerId);
  });

  test('POST /api/conversations creates a new chat session', async () => {
    const res = await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ title: 'Test Integration Inquiry' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeDefined();

    conversationId = res.body.data.id;
  });

  test('POST /api/conversations/:id/messages triggers grounded RAG response', async () => {
    const res = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        content: 'What is the return window for items bought on NovaCart?',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.userMessage.content).toContain('return window');
    expect(res.body.data.botMessage.content).toBeDefined();
    expect(res.body.data.botMessage.support_status).toBe('SUPPORTED');
    expect(res.body.data.botMessage.sources.length).toBeGreaterThan(0);
  });

  test('POST /api/conversations/:id/escalate escalates chat to support ticket', async () => {
    const res = await request(app)
      .post(`/api/conversations/${conversationId}/escalate`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ reason: 'Integration test escalation' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.ticketNumber).toBeDefined();
    expect(res.body.data.ticketId).toBeDefined();
  });

  test('GET /api/tickets lists customer tickets', async () => {
    const res = await request(app)
      .get('/api/tickets')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });
});
