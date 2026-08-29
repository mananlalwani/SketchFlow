import type express from 'express';
import { env } from '../config/env.js';
import { checkDatabaseHealth } from '../lib/prisma.js';

export interface HealthRouteState {
  connectionCount: () => number;
  isShuttingDown: () => boolean;
}

/** Owns liveness/readiness semantics while the process supplies only live state. */
export function registerHealthRoutes(app: express.Express, state: HealthRouteState): void {
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      connections: state.connectionCount(),
      release: env.RELEASE_ID ?? 'unknown',
    });
  });

  app.get('/api/healthz', (_req, res) => {
    if (state.isShuttingDown()) {
      res.status(503).json({ status: 'shutting_down' });
      return;
    }
    res.json({ status: 'ok', release: env.RELEASE_ID ?? 'unknown' });
  });

  app.get('/api/readyz', async (_req, res) => {
    if (state.isShuttingDown()) {
      res.status(503).json({ status: 'shutting_down' });
      return;
    }
    if (!(await checkDatabaseHealth())) {
      res.status(503).json({ status: 'database_unhealthy' });
      return;
    }
    res.json({
      status: 'ok',
      database: 'connected',
      connections: state.connectionCount(),
      release: env.RELEASE_ID ?? 'unknown',
    });
  });
}
