import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { Logger, logger } from '../utils/logger.js';

/**
 * Request ID middleware - adds correlation ID to all requests
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = (req.headers['x-request-id'] as string) || randomUUID();
  req.headers['x-request-id'] = requestId;
  res.setHeader('x-request-id', requestId);
  Logger.setRequestId(requestId);
  next();
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
export function securityHeadersMiddleware(req: Request, res: Response, next: NextFunction): void {
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

export function rateLimitMiddleware(options: {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (req: Request) => string;
}) {
  const { windowMs, maxRequests, keyGenerator } = options;
  
  // Cleanup old entries periodically
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
      if (entry.resetTime < now) {
        rateLimitStore.delete(key);
      }
    }
  }, windowMs);

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = keyGenerator ? keyGenerator(req) : (req.ip || req.socket.remoteAddress || 'unknown');
    const now = Date.now();
    
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
export function errorHandlerMiddleware(err: Error, req: Request, res: Response, _next: NextFunction): void {
  logger.error('Unhandled error', err, {
    method: req.method,
    path: req.path,
    query: req.query,
  });

  // Don't leak error details in production
  const message = process.env.NODE_ENV === 'production' 
    ? 'Internal server error' 
    : err.message;

  res.status(500).json({
    error: message,
    requestId: req.headers['x-request-id'],
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
