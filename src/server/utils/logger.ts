import { trace, context } from '@opentelemetry/api';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type LogFormat = 'pretty' | 'json';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  requestId?: string;
  traceId?: string;
  spanId?: string;
  [key: string]: unknown;
}

/**
 * Sensitive field patterns to redact from logs
 */
const REDACT_PATTERNS = [
  /authorization/i,
  /cookie/i,
  /password/i,
  /secret/i,
  /token/i,
  /api[_-]?key/i,
  /clerk/i,
  /session/i,
  /jwt/i,
  /bearer/i,
  /x-honeycomb/i,
  /credential/i,
];

/**
 * Redact sensitive values from an object (shallow)
 */
function redactSensitive(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    const isSensitive = REDACT_PATTERNS.some((pattern) => pattern.test(key));
    
    if (isSensitive) {
      result[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // Recursively redact nested objects (one level deep for safety)
      result[key] = redactSensitive(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  
  return result;
}

/**
 * Get current trace context from OpenTelemetry
 */
function getTraceContext(): { traceId?: string; spanId?: string } {
  try {
    const span = trace.getSpan(context.active());
    if (span) {
      const spanContext = span.spanContext();
      return {
        traceId: spanContext.traceId,
        spanId: spanContext.spanId,
      };
    }
  } catch {
    // OTel not initialized or no active span
  }
  return {};
}

class Logger {
  private logLevel: LogLevel;
  private logFormat: LogFormat;
  private static requestId: string | undefined;

  constructor() {
    this.logLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';
    this.logFormat = (process.env.LOG_FORMAT as LogFormat) || 
      (process.env.NODE_ENV === 'production' ? 'json' : 'pretty');
  }

  /**
   * Set the current request ID for correlation
   */
  static setRequestId(id: string | undefined): void {
    Logger.requestId = id;
  }

  /**
   * Get the current request ID
   */
  static getRequestId(): string | undefined {
    return Logger.requestId;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: Record<LogLevel, number> = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3
    };
    return levels[level] >= levels[this.logLevel];
  }

  private formatMessage(level: LogLevel, message: string, meta?: Record<string, unknown>): string {
    const traceContext = getTraceContext();
    const redactedMeta = meta ? redactSensitive(meta) : undefined;
    
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(Logger.requestId && { requestId: Logger.requestId }),
      ...(traceContext.traceId && { traceId: traceContext.traceId }),
      ...(traceContext.spanId && { spanId: traceContext.spanId }),
      ...redactedMeta,
    };

    if (this.logFormat === 'json') {
      return JSON.stringify(entry);
    }

    // Pretty format for development
    const levelStr = level.toUpperCase().padEnd(5);
    const reqIdStr = Logger.requestId ? ` [req:${Logger.requestId.slice(0, 8)}]` : '';
    const traceStr = traceContext.traceId ? ` [trace:${traceContext.traceId.slice(0, 8)}]` : '';
    const metaStr = redactedMeta && Object.keys(redactedMeta).length > 0 
      ? ` ${JSON.stringify(redactedMeta)}` 
      : '';
    return `[${entry.timestamp}] ${levelStr}${reqIdStr}${traceStr} ${message}${metaStr}`;
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog('debug')) {
      console.log(this.formatMessage('debug', message, meta));
    }
  }

  info(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog('info')) {
      console.log(this.formatMessage('info', message, meta));
    }
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message, meta));
    }
  }

  error(message: string, error?: unknown, meta?: Record<string, unknown>): void {
    if (this.shouldLog('error')) {
      const errorMeta: Record<string, unknown> = { ...meta };
      
      if (error instanceof Error) {
        errorMeta.errorMessage = error.message;
        errorMeta.errorStack = error.stack;
        errorMeta.errorName = error.name;
      } else if (error !== undefined) {
        errorMeta.error = error;
      }
      
      console.error(this.formatMessage('error', message, errorMeta));
      
      // Also record error on current span if available
      try {
        const span = trace.getSpan(context.active());
        if (span && error instanceof Error) {
          span.recordException(error);
        }
      } catch {
        // OTel not available
      }
    }
  }

  /**
   * Log an HTTP request (for request logging middleware)
   */
  request(method: string, url: string, statusCode: number, durationMs: number, meta?: Record<string, unknown>): void {
    const logMeta = {
      method,
      url,
      statusCode,
      durationMs,
      ...meta,
    };

    // Use warn for 4xx, error for 5xx
    if (statusCode >= 500) {
      this.error(`${method} ${url} ${statusCode}`, undefined, logMeta);
    } else if (statusCode >= 400) {
      this.warn(`${method} ${url} ${statusCode}`, logMeta);
    } else {
      this.info(`${method} ${url} ${statusCode}`, logMeta);
    }
  }

  /**
   * Create a child logger with additional context (for service-specific logging)
   */
  child(context: Record<string, unknown>): ChildLogger {
    return new ChildLogger(this, context);
  }
}

/**
 * Child logger with inherited context
 */
class ChildLogger {
  constructor(
    private parent: Logger,
    private context: Record<string, unknown>
  ) {}

  debug(message: string, meta?: Record<string, unknown>): void {
    this.parent.debug(message, { ...this.context, ...meta });
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.parent.info(message, { ...this.context, ...meta });
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.parent.warn(message, { ...this.context, ...meta });
  }

  error(message: string, error?: unknown, meta?: Record<string, unknown>): void {
    this.parent.error(message, error, { ...this.context, ...meta });
  }
}

export const logger = new Logger();
export { Logger, ChildLogger, redactSensitive, getTraceContext };
