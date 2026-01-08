/**
 * Redact sensitive values from an object (shallow)
 */
declare function redactSensitive(obj: Record<string, unknown>): Record<string, unknown>;
/**
 * Get current trace context from OpenTelemetry
 */
declare function getTraceContext(): {
    traceId?: string;
    spanId?: string;
};
declare class Logger {
    private logLevel;
    private logFormat;
    private static requestId;
    constructor();
    /**
     * Set the current request ID for correlation
     */
    static setRequestId(id: string | undefined): void;
    /**
     * Get the current request ID
     */
    static getRequestId(): string | undefined;
    private shouldLog;
    private formatMessage;
    debug(message: string, meta?: Record<string, unknown>): void;
    info(message: string, meta?: Record<string, unknown>): void;
    warn(message: string, meta?: Record<string, unknown>): void;
    error(message: string, error?: unknown, meta?: Record<string, unknown>): void;
    /**
     * Log an HTTP request (for request logging middleware)
     */
    request(method: string, url: string, statusCode: number, durationMs: number, meta?: Record<string, unknown>): void;
    /**
     * Create a child logger with additional context (for service-specific logging)
     */
    child(context: Record<string, unknown>): ChildLogger;
}
/**
 * Child logger with inherited context
 */
declare class ChildLogger {
    private parent;
    private context;
    constructor(parent: Logger, context: Record<string, unknown>);
    debug(message: string, meta?: Record<string, unknown>): void;
    info(message: string, meta?: Record<string, unknown>): void;
    warn(message: string, meta?: Record<string, unknown>): void;
    error(message: string, error?: unknown, meta?: Record<string, unknown>): void;
}
export declare const logger: Logger;
export { Logger, ChildLogger, redactSensitive, getTraceContext };
//# sourceMappingURL=logger.d.ts.map