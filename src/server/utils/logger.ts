type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type LogFormat = 'pretty' | 'json';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  requestId?: string;
  [key: string]: unknown;
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
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(Logger.requestId && { requestId: Logger.requestId }),
      ...meta,
    };

    if (this.logFormat === 'json') {
      return JSON.stringify(entry);
    }

    // Pretty format for development
    const levelStr = level.toUpperCase().padEnd(5);
    const reqIdStr = Logger.requestId ? ` [${Logger.requestId.slice(0, 8)}]` : '';
    const metaStr = meta && Object.keys(meta).length > 0 
      ? ` ${JSON.stringify(meta)}` 
      : '';
    return `[${entry.timestamp}] ${levelStr}${reqIdStr} ${message}${metaStr}`;
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
      } else if (error !== undefined) {
        errorMeta.error = error;
      }
      
      console.error(this.formatMessage('error', message, errorMeta));
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
}

export const logger = new Logger();
export { Logger };
