import { Request, Response, NextFunction } from 'express';
/**
 * Request ID middleware - adds correlation ID to all requests
 */
export declare function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void;
/**
 * Request logging middleware - logs all HTTP requests
 */
export declare function requestLoggingMiddleware(req: Request, res: Response, next: NextFunction): void;
/**
 * Security headers middleware (helmet-like)
 */
export declare function securityHeadersMiddleware(req: Request, res: Response, next: NextFunction): void;
export declare function rateLimitMiddleware(options: {
    windowMs: number;
    maxRequests: number;
    keyGenerator?: (req: Request) => string;
}): (req: Request, res: Response, next: NextFunction) => void;
/**
 * Error handling middleware - consistent error responses
 */
export declare function errorHandlerMiddleware(err: Error, req: Request, res: Response, _next: NextFunction): void;
/**
 * 404 handler for API routes
 */
export declare function notFoundMiddleware(req: Request, res: Response): void;
//# sourceMappingURL=index.d.ts.map