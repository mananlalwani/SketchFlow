import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';

// Create a minimal test app with just the health endpoints
function createTestApp() {
  const app = express();
  
  let isShuttingDown = false;
  let connectionCount = 0;
  
  // Mock health endpoints matching the real server
  app.get('/api/health', (_req, res) => {
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      connections: connectionCount,
    });
  });

  app.get('/api/healthz', (_req, res) => {
    if (isShuttingDown) {
      res.status(503).json({ status: 'shutting_down' });
      return;
    }
    res.json({ status: 'ok' });
  });

  app.get('/api/readyz', (_req, res) => {
    if (isShuttingDown) {
      res.status(503).json({ status: 'shutting_down' });
      return;
    }
    // In tests, assume DB is healthy
    res.json({ 
      status: 'ok',
      database: 'connected',
      connections: connectionCount,
    });
  });

  return {
    app,
    setShuttingDown: (value: boolean) => { isShuttingDown = value; },
    setConnectionCount: (count: number) => { connectionCount = count; },
  };
}

describe('Health API', () => {
  const testServer = createTestApp();
  const { app } = testServer;

  describe('GET /api/health', () => {
    it('should return ok status', async () => {
      const response = await request(app).get('/api/health');
      
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
      expect(response.body.timestamp).toBeDefined();
    });

    it('should include connection count', async () => {
      testServer.setConnectionCount(5);
      
      const response = await request(app).get('/api/health');
      
      expect(response.body.connections).toBe(5);
    });
  });

  describe('GET /api/healthz (liveness)', () => {
    it('should return ok when running', async () => {
      testServer.setShuttingDown(false);
      
      const response = await request(app).get('/api/healthz');
      
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
    });

    it('should return 503 when shutting down', async () => {
      testServer.setShuttingDown(true);
      
      const response = await request(app).get('/api/healthz');
      
      expect(response.status).toBe(503);
      expect(response.body.status).toBe('shutting_down');
    });
  });

  describe('GET /api/readyz (readiness)', () => {
    it('should return ok with database status', async () => {
      testServer.setShuttingDown(false);
      
      const response = await request(app).get('/api/readyz');
      
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
      expect(response.body.database).toBe('connected');
    });

    it('should return 503 when shutting down', async () => {
      testServer.setShuttingDown(true);
      
      const response = await request(app).get('/api/readyz');
      
      expect(response.status).toBe(503);
    });
  });
});
