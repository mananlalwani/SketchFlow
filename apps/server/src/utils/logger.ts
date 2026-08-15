import { trace, context } from '@opentelemetry/api';
import { z } from 'zod';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type LogFormat = 'pretty' | 'json';
type LogValue = string | number | boolean | null | undefined | Date | Error | readonly string[];
type LogMetadata = Record<string, LogValue>;

interface TraceContext {
  traceId?: string;
  spanId?: string;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  requestId?: string;
  traceId?: string;
  spanId?: string;
  [key: string]: LogValue;
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
function redactSensitive(obj: LogMetadata) {
  return Object.fromEntries(
    Object.entries(obj).map(([key, value]) => [
      key,
      REDACT_PATTERNS.some((pattern) => pattern.test(key)) ? '[REDACTED]' : value,
    ]),
  );
}

/**
 * Get current trace context from OpenTelemetry
 */
function getTraceContext(): TraceContext {
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
    this.logLevel = z
      .enum(['debug', 'info', 'warn', 'error'])
      .catch('info')
      .parse(process.env.LOG_LEVEL);
    this.logFormat = z
      .enum(['pretty', 'json'])
      .catch(process.env.NODE_ENV === 'production' ? 'json' : 'pretty')
      .parse(process.env.LOG_FORMAT);
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
    const levels = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3,
    };
    return levels[level] >= levels[this.logLevel];
  }

  private formatMessage(level: LogLevel, message: string, meta?: LogMetadata): string {
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
    const metaStr =
      redactedMeta && Object.keys(redactedMeta).length > 0
        ? ` ${JSON.stringify(redactedMeta)}`
        : '';
    return `[${entry.timestamp}] ${levelStr}${reqIdStr}${traceStr} ${message}${metaStr}`;
  }

  debug(message: string, meta?: LogMetadata): void {
    if (this.shouldLog('debug')) {
      console.log(this.formatMessage('debug', message, meta));
    }
  }

  info(message: string, meta?: LogMetadata): void {
    if (this.shouldLog('info')) {
      console.log(this.formatMessage('info', message, meta));
    }
  }

  warn(message: string, meta?: LogMetadata): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message, meta));
    }
  }

  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- JavaScript permits throwing any value; this boundary normalizes it before logging.
  error(message: string, error?: unknown, meta?: LogMetadata): void {
    if (this.shouldLog('error')) {
      const errorMeta = { ...meta } satisfies LogMetadata;

      if (error instanceof Error) {
        errorMeta.errorMessage = error.message;
        errorMeta.errorStack = error.stack;
        errorMeta.errorName = error.name;
      } else if (error !== undefined) {
        errorMeta.error = String(error);
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
  request(
    method: string,
    url: string,
    statusCode: number,
    durationMs: number,
    meta?: LogMetadata,
  ): void {
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
  child(context: LogMetadata): ChildLogger {
    return new ChildLogger(this, context);
  }
}

/**
 * Child logger with inherited context
 */
class ChildLogger {
  constructor(
    private parent: Logger,
    private context: LogMetadata,
  ) {}

  debug(message: string, meta?: LogMetadata): void {
    this.parent.debug(message, { ...this.context, ...meta });
  }

  info(message: string, meta?: LogMetadata): void {
    this.parent.info(message, { ...this.context, ...meta });
  }

  warn(message: string, meta?: LogMetadata): void {
    this.parent.warn(message, { ...this.context, ...meta });
  }

  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- JavaScript permits throwing any value; this boundary normalizes it before logging.
  error(message: string, error?: unknown, meta?: LogMetadata): void {
    this.parent.error(message, error, { ...this.context, ...meta });
  }
}

export const logger = new Logger();
export { Logger, ChildLogger, redactSensitive, getTraceContext };
