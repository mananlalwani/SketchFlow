import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { Logger, logger, getTraceContext } from '../utils/logger.js';
import { createClient } from 'redis';
import { env, isProd } from '../config/env.js';
import { captureServerException, captureServerSignal } from '../sentry.js';
import { z } from 'zod';

/**
 * Request ID middleware - adds correlation ID to all requests
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestHeader = req.headers['x-request-id'];
  const candidate = Array.isArray(requestHeader) ? requestHeader[0] : requestHeader;
  const requestId =
    candidate && /^[A-Za-z0-9._:-]{1,128}$/.test(candidate) ? candidate : randomUUID();
  req.headers['x-request-id'] = requestId;
  res.setHeader('x-request-id', requestId);
  Logger.runWithRequestId(requestId, next);
}

/**
 * Request logging middleware - logs all HTTP requests
 */
export function requestLoggingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    // Skip health check spam in logs
    if (req.path === '/api/health' || req.path === '/api/healthz' || req.path === '/api/readyz') {
      return;
    }
    logger.request(req.method, req.path, res.statusCode, duration, {
      userAgent: req.headers['user-agent'],
      ip: req.ip || req.socket.remoteAddress,
    });
  });

  next();
}

/**
 * Security headers middleware (helmet-like)
 */
export function securityHeadersMiddleware(_req: Request, res: Response, next: NextFunction): void {
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');

  // Enable XSS filter
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Don't expose server info
  res.removeHeader('X-Powered-By');

  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; img-src 'self' data: blob: https:; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https: wss:; worker-src 'self' blob:",
  );

  // Content Security Policy (basic)
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  next();
}

/**
 * Simple in-memory rate limiter
 * For production, consider using Redis-based rate limiting
 */
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();
type RateLimitRedisClient = {
  readonly isOpen: boolean;
  connect(): Promise<void>;
  evaluate(key: string, windowMs: number): Promise<[count: number, ttl: number]>;
};
const redisRateLimitResultSchema = z.tuple([z.number(), z.number()]);

const REDIS_RATE_LIMIT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return { count, redis.call('PTTL', KEYS[1]) }
`;

let redisLimiter: RateLimitRedisClient | null = null;
let redisLimiterConnecting: Promise<RateLimitRedisClient | null> | null = null;
let redisLimiterRetryAfter = 0;

function createRateLimitRedisClient(): RateLimitRedisClient {
  const client = createClient({ url: env.REDIS_URL });
  client.on('error', (error) => logger.error('Redis rate limiter error', error));
  return {
    get isOpen() {
      return client.isOpen;
    },
    async connect() {
      await client.connect();
    },
    async evaluate(key, windowMs) {
      const result = await client.eval(REDIS_RATE_LIMIT_SCRIPT, {
        keys: [key],
        arguments: [String(windowMs)],
      });
      return redisRateLimitResultSchema.parse(result);
    },
  };
}

async function getRedisLimiter(): Promise<RateLimitRedisClient | null> {
  if (!env.REDIS_URL) return null;
  if (redisLimiter?.isOpen) return redisLimiter;
  if (Date.now() < redisLimiterRetryAfter) return null;
  if (!redisLimiterConnecting) {
    redisLimiterConnecting = (async () => {
      const client = createRateLimitRedisClient();
      await client.connect();
      redisLimiter = client;
      redisLimiterConnecting = null;
      redisLimiterRetryAfter = 0;
      return client;
    })().catch((error) => {
      logger.error('Redis rate limiter unavailable', error);
      redisLimiter = null;
      redisLimiterConnecting = null;
      redisLimiterRetryAfter = Date.now() + 1000;
      return null;
    });
  }
  return redisLimiterConnecting;
}

export function rateLimitMiddleware(options: {
  namespace: string;
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (req: Request) => string;
}) {
  const { namespace, windowMs, maxRequests, keyGenerator } = options;

  // Cleanup old entries periodically
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
      if (entry.resetTime < now) {
        rateLimitStore.delete(key);
      }
    }
  }, windowMs);
  cleanupTimer.unref();

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const clientKey = keyGenerator
      ? keyGenerator(req)
      : req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${namespace}:${clientKey}`;
    const now = Date.now();

    const redis = await getRedisLimiter();
    if (redis) {
      const redisKey = `sketchflow:rate-limit:${key}`;
      const [count, ttl] = await redis.evaluate(redisKey, windowMs);
      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - count));
      res.setHeader('X-RateLimit-Reset', Math.ceil((Date.now() + Math.max(0, ttl)) / 1000));
      if (count > maxRequests) {
        res
          .status(429)
          .json({ error: 'Too many requests', retryAfter: Math.ceil(Math.max(0, ttl) / 1000) });
        return;
      }
      next();
      return;
    }

    if (isProd && env.REDIS_URL) {
      res.status(503).json({ error: 'Rate limiter unavailable' });
      return;
    }

    let entry = rateLimitStore.get(key);

    if (!entry || entry.resetTime < now) {
      entry = { count: 0, resetTime: now + windowMs };
      rateLimitStore.set(key, entry);
    }

    entry.count++;

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - entry.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetTime / 1000));

    if (entry.count > maxRequests) {
      res.status(429).json({
        error: 'Too many requests',
        retryAfter: Math.ceil((entry.resetTime - now) / 1000),
      });
      return;
    }

    next();
  };
}

/**
 * Error handling middleware - consistent error responses
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandlerMiddleware(
  err: Error & { status?: number; statusCode?: number },
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const traceContext = getTraceContext();

  logger.error('Unhandled error', err, {
    method: req.method,
    path: req.route?.path || req.path,
    ...(traceContext.traceId && { traceId: traceContext.traceId }),
  });
  captureServerException(err, {
    method: req.method,
    route: req.route?.path || req.path,
    status: err.statusCode ?? err.status ?? 500,
    ...(traceContext.traceId && { traceId: traceContext.traceId }),
    ...(traceContext.spanId && { spanId: traceContext.spanId }),
  });

  // Don't leak error details in production
  const message = process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message;

  const status = err.statusCode ?? err.status;
  const expectedStatus =
    status === 400 || status === 403 || status === 404 || status === 413 ? status : 500;
  if (expectedStatus >= 500) {
    captureServerSignal('api_5xx', { method: req.method, route: req.route?.path || req.path });
  }
  res.status(expectedStatus).json({
    error: message,
    requestId: req.headers['x-request-id'],
    ...(traceContext.traceId && { traceId: traceContext.traceId }),
  });
}

/**
 * 404 handler for API routes
 */
export function notFoundMiddleware(req: Request, res: Response): void {
  res.status(404).json({
    error: 'Not found',
    path: req.path,
    requestId: req.headers['x-request-id'],
  });
}
