import { trace, context } from '@opentelemetry/api';
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
function redactSensitive(obj) {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
        const isSensitive = REDACT_PATTERNS.some((pattern) => pattern.test(key));
        if (isSensitive) {
            result[key] = '[REDACTED]';
        }
        else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            // Recursively redact nested objects (one level deep for safety)
            result[key] = redactSensitive(value);
        }
        else {
            result[key] = value;
        }
    }
    return result;
}
/**
 * Get current trace context from OpenTelemetry
 */
function getTraceContext() {
    try {
        const span = trace.getSpan(context.active());
        if (span) {
            const spanContext = span.spanContext();
            return {
                traceId: spanContext.traceId,
                spanId: spanContext.spanId,
            };
        }
    }
    catch {
        // OTel not initialized or no active span
    }
    return {};
}
class Logger {
    logLevel;
    logFormat;
    static requestId;
    constructor() {
        this.logLevel = process.env.LOG_LEVEL || 'info';
        this.logFormat = process.env.LOG_FORMAT ||
            (process.env.NODE_ENV === 'production' ? 'json' : 'pretty');
    }
    /**
     * Set the current request ID for correlation
     */
    static setRequestId(id) {
        Logger.requestId = id;
    }
    /**
     * Get the current request ID
     */
    static getRequestId() {
        return Logger.requestId;
    }
    shouldLog(level) {
        const levels = {
            debug: 0,
            info: 1,
            warn: 2,
            error: 3
        };
        return levels[level] >= levels[this.logLevel];
    }
    formatMessage(level, message, meta) {
        const traceContext = getTraceContext();
        const redactedMeta = meta ? redactSensitive(meta) : undefined;
        const entry = {
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
    debug(message, meta) {
        if (this.shouldLog('debug')) {
            console.log(this.formatMessage('debug', message, meta));
        }
    }
    info(message, meta) {
        if (this.shouldLog('info')) {
            console.log(this.formatMessage('info', message, meta));
        }
    }
    warn(message, meta) {
        if (this.shouldLog('warn')) {
            console.warn(this.formatMessage('warn', message, meta));
        }
    }
    error(message, error, meta) {
        if (this.shouldLog('error')) {
            const errorMeta = { ...meta };
            if (error instanceof Error) {
                errorMeta.errorMessage = error.message;
                errorMeta.errorStack = error.stack;
                errorMeta.errorName = error.name;
            }
            else if (error !== undefined) {
                errorMeta.error = error;
            }
            console.error(this.formatMessage('error', message, errorMeta));
            // Also record error on current span if available
            try {
                const span = trace.getSpan(context.active());
                if (span && error instanceof Error) {
                    span.recordException(error);
                }
            }
            catch {
                // OTel not available
            }
        }
    }
    /**
     * Log an HTTP request (for request logging middleware)
     */
    request(method, url, statusCode, durationMs, meta) {
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
        }
        else if (statusCode >= 400) {
            this.warn(`${method} ${url} ${statusCode}`, logMeta);
        }
        else {
            this.info(`${method} ${url} ${statusCode}`, logMeta);
        }
    }
    /**
     * Create a child logger with additional context (for service-specific logging)
     */
    child(context) {
        return new ChildLogger(this, context);
    }
}
/**
 * Child logger with inherited context
 */
class ChildLogger {
    parent;
    context;
    constructor(parent, context) {
        this.parent = parent;
        this.context = context;
    }
    debug(message, meta) {
        this.parent.debug(message, { ...this.context, ...meta });
    }
    info(message, meta) {
        this.parent.info(message, { ...this.context, ...meta });
    }
    warn(message, meta) {
        this.parent.warn(message, { ...this.context, ...meta });
    }
    error(message, error, meta) {
        this.parent.error(message, error, { ...this.context, ...meta });
    }
}
export const logger = new Logger();
export { Logger, ChildLogger, redactSensitive, getTraceContext };
//# sourceMappingURL=logger.js.map