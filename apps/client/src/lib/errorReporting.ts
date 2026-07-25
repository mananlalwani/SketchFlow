/**
 * Error reporting utility with OpenTelemetry integration
 *
 * This module provides a simple interface for error reporting that integrates
 * with OpenTelemetry for trace correlation and can be extended for services
 * like Sentry, LogRocket, etc.
 */
import { getTraceContext, recordError, getTracer } from './otel';
import { captureException, setSentryUser } from './sentry';

interface ErrorContext {
  componentStack?: string;
  [key: string]: unknown;
}

// Store current user for context
let currentUserId: string | null = null;

/**
 * Report an error to the error tracking service
 */
export function reportError(error: Error, context?: ErrorContext): void {
  const traceContext = getTraceContext();
  captureException(error, {
    ...context,
    ...(traceContext.traceId && { traceId: traceContext.traceId }),
    ...(traceContext.spanId && { spanId: traceContext.spanId }),
  });

  // Record error on current OTel span if available
  recordError(error);

  // Create a span for the error if we have a tracer
  const tracer = getTracer();
  if (tracer) {
    const span = tracer.startSpan('error.reported');
    span.setAttribute('error.message', error.message);
    span.setAttribute('error.name', error.name);
    if (error.stack) {
      span.setAttribute('error.stack', error.stack);
    }
    if (context?.componentStack) {
      span.setAttribute('error.componentStack', context.componentStack);
    }
    if (currentUserId) {
      span.setAttribute('user.id', currentUserId);
    }
    span.recordException(error);
    span.end();
  }

  // Build log context
  const logContext = {
    message: error.message,
    name: error.name,
    stack: error.stack,
    ...context,
    ...(traceContext.traceId && { traceId: traceContext.traceId }),
    ...(traceContext.spanId && { spanId: traceContext.spanId }),
    ...(currentUserId && { userId: currentUserId }),
  };

  // In development, just log to console
  if (import.meta.env.DEV) {
    console.error('[Error Reported]', error, logContext);
    return;
  }

  // In production, log structured error
  console.error('[Production Error]', JSON.stringify(logContext));
}

/**
 * Set user context for error tracking
 */
export function setErrorUser(userId: string | null): void {
  currentUserId = userId;
  setSentryUser(userId);

  if (import.meta.env.DEV) {
    console.debug(
      '[Error Tracking] authentication state set:',
      userId ? 'authenticated' : 'anonymous',
    );
  }
}

/**
 * Add breadcrumb for error tracking
 * Creates an OTel span event for trace correlation
 */
export function addBreadcrumb(
  message: string,
  category?: string,
  data?: Record<string, unknown>,
): void {
  const traceContext = getTraceContext();
  const tracer = getTracer();

  // Create a span for the breadcrumb
  if (tracer) {
    const span = tracer.startSpan(`breadcrumb.${category || 'general'}`);
    span.setAttribute('breadcrumb.message', message);
    span.setAttribute('breadcrumb.category', category || 'general');
    if (data) {
      Object.entries(data).forEach(([key, value]) => {
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          span.setAttribute(`breadcrumb.data.${key}`, value);
        }
      });
    }
    span.end();
  }

  if (import.meta.env.DEV) {
    console.debug('[Breadcrumb]', category || 'general', message, data, traceContext);
  }
}

/**
 * Get current trace context for correlation
 */
export { getTraceContext } from './otel';
