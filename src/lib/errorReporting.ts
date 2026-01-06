/**
 * Error reporting utility
 * 
 * This module provides a simple interface for error reporting that can be
 * extended to integrate with services like Sentry, LogRocket, etc.
 * 
 * To integrate Sentry:
 * 1. Install: pnpm add @sentry/react
 * 2. Initialize in main.tsx before render
 * 3. Update this file to use Sentry.captureException
 */

interface ErrorContext {
  componentStack?: string;
  [key: string]: unknown;
}

/**
 * Report an error to the error tracking service
 */
export function reportError(error: Error, context?: ErrorContext): void {
  // In development, just log to console
  if (import.meta.env.DEV) {
    console.error('[Error Reported]', error, context);
    return;
  }

  // In production, send to error tracking service
  // TODO: Integrate with Sentry or similar service
  // Example Sentry integration:
  // Sentry.captureException(error, { extra: context });
  
  // For now, log to console in production as well
  console.error('[Production Error]', {
    message: error.message,
    stack: error.stack,
    ...context,
  });
}

/**
 * Set user context for error tracking
 */
export function setErrorUser(userId: string | null): void {
  // TODO: Integrate with Sentry or similar
  // Sentry.setUser(userId ? { id: userId } : null);
  
  if (import.meta.env.DEV) {
    console.debug('[Error Tracking] User set:', userId);
  }
}

/**
 * Add breadcrumb for error tracking
 */
export function addBreadcrumb(message: string, category?: string, data?: Record<string, unknown>): void {
  // TODO: Integrate with Sentry or similar
  // Sentry.addBreadcrumb({ message, category, data });
  
  if (import.meta.env.DEV) {
    console.debug('[Breadcrumb]', category || 'general', message, data);
  }
}
