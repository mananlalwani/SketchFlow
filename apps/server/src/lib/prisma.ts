import Prisma from '@prisma/client';
const { PrismaClient } = Prisma;
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { logger } from '../utils/logger.js';
import { env, isDev, isProd } from '../config/env.js';

/* eslint-disable no-var -- Global declarations require `var` in TypeScript. */
declare global {
  var __sketchflowPrisma: InstanceType<typeof PrismaClient> | undefined;
  var __sketchflowPool: Pool | undefined;
}
/* eslint-enable no-var */

// PrismaClient is attached to the `global` object in development to prevent
// exhausting your database connection limit.
// Learn more: https://pris.ly/d/help/next-js-best-practices

// Create pg Pool and adapter for Prisma 7
const pool =
  globalThis.__sketchflowPool ??
  new Pool({
    connectionString: env.DATABASE_URL,
    // Connection pool settings for production
    max: isProd ? 10 : 5, // Max connections in pool
    idleTimeoutMillis: 30000, // Close idle connections after 30s
    connectionTimeoutMillis: 10000, // Connection timeout
  });

const adapter = new PrismaPg(pool);

export const prisma =
  globalThis.__sketchflowPrisma ??
  new PrismaClient({
    adapter: adapter,
    log: isDev ? ['query', 'error', 'warn'] : ['error'],
  });

// Cache in dev to prevent connection exhaustion during hot reload
if (!isProd) {
  globalThis.__sketchflowPrisma = prisma;
  globalThis.__sketchflowPool = pool;
}

/**
 * Gracefully disconnect Prisma and close the connection pool
 * Called during server shutdown
 */
export async function disconnectPrisma(): Promise<void> {
  try {
    await prisma.$disconnect();
    await pool.end();
    logger.info('Prisma client and pool disconnected');
  } catch (error) {
    logger.error('Error disconnecting Prisma:', error);
  }
}

/**
 * Check if database is reachable (for readiness probes)
 */
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    logger.error('Database health check failed:', error);
    return false;
  }
}
