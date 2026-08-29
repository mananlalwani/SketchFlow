import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../config/env.js', () => ({ env: { REDIS_URL: undefined }, isProd: false }));
vi.mock('../../utils/logger.js', () => ({
  Logger: { runWithRequestId: (_requestId: string, callback: () => void) => callback() },
  getTraceContext: vi.fn(() => ({})),
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), request: vi.fn() },
}));

import { rateLimitMiddleware } from '../../middleware/index.js';

describe('rateLimitMiddleware', () => {
  it('shares a namespace budget across varying request paths', async () => {
    const app = express();
    app.use(rateLimitMiddleware({ namespace: 'path-test', windowMs: 60_000, maxRequests: 1 }));
    app.get('/first', (_req, res) => res.sendStatus(200));
    app.get('/second', (_req, res) => res.sendStatus(200));

    await expect(request(app).get('/first')).resolves.toMatchObject({ status: 200 });
    await expect(request(app).get('/second')).resolves.toMatchObject({ status: 429 });
  });

  it('keeps independently named limiter budgets separate', async () => {
    const first = express();
    first.use(rateLimitMiddleware({ namespace: 'first-test', windowMs: 60_000, maxRequests: 1 }));
    first.get('/', (_req, res) => res.sendStatus(200));
    const second = express();
    second.use(rateLimitMiddleware({ namespace: 'second-test', windowMs: 60_000, maxRequests: 1 }));
    second.get('/', (_req, res) => res.sendStatus(200));

    await expect(request(first).get('/')).resolves.toMatchObject({ status: 200 });
    await expect(request(second).get('/')).resolves.toMatchObject({ status: 200 });
  });
});
