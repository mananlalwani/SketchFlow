/**
 * Browser telemetry is intentionally disabled until SketchFlow has a controlled,
 * same-origin collector. Private ingestion credentials and arbitrary OTLP headers
 * must never be compiled into a Vite bundle.
 */

export interface BrowserTelemetrySpan {
  setAttribute(name: string, value: string | number | boolean): void;
  recordException(error: Error): void;
  end(): void;
}

export interface BrowserTelemetryTracer {
  startSpan(name: string): BrowserTelemetrySpan;
}

export interface BrowserTraceContext {
  traceId?: string;
  spanId?: string;
}

export function initOtel(): void {
  if (import.meta.env.DEV) {
    console.debug(
      '[OTel] Browser telemetry is disabled until a controlled collector is configured.',
    );
  }
}

export function getTraceContext(): BrowserTraceContext {
  return {};
}

export function getTracer(_name = 'sketchflow-client'): BrowserTelemetryTracer | null {
  void _name;
  return null;
}

export function recordError(_error: Error): void {
  void _error;
  // Deliberately no-op: browser errors are handled by the privacy-filtered Sentry path.
}

export async function shutdownOtel(): Promise<void> {
  // No browser telemetry provider is initialized.
}

export const isOtelInitialized = false;
