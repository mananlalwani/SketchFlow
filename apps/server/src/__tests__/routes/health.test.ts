import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../config/env.js', () => ({ env: { RELEASE_ID: 'test-release' } }));
vi.mock('../../lib/prisma.js', () => ({ checkDatabaseHealth: vi.fn() }));

import { checkDatabaseHealth } from '../../lib/prisma.js';
import { registerHealthRoutes } from '../../routes/health.js';

describe('health routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reports live process metadata', async () => {
    const app = express();
    registerHealthRoutes(app, { connectionCount: () => 3, isShuttingDown: () => false });

    const response = await request(app).get('/api/health');
    expect(response).toMatchObject({
      status: 200,
      body: { status: 'ok', connections: 3, release: 'test-release' },
    });
    expect(response.body.timestamp).toEqual(expect.any(String));
  });

  it('fails liveness and readiness while shutting down', async () => {
    const app = express();
    registerHealthRoutes(app, { connectionCount: () => 0, isShuttingDown: () => true });

    await expect(request(app).get('/api/healthz')).resolves.toMatchObject({
      status: 503,
      body: { status: 'shutting_down' },
    });
    await expect(request(app).get('/api/readyz')).resolves.toMatchObject({
      status: 503,
      body: { status: 'shutting_down' },
    });
    expect(checkDatabaseHealth).not.toHaveBeenCalled();
  });

  it('requires database health for readiness', async () => {
    vi.mocked(checkDatabaseHealth).mockResolvedValue(false);
    const app = express();
    registerHealthRoutes(app, { connectionCount: () => 1, isShuttingDown: () => false });

    await expect(request(app).get('/api/readyz')).resolves.toMatchObject({
      status: 503,
      body: { status: 'database_unhealthy' },
    });
  });
});
