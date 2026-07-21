/**
 * OpenTelemetry Web SDK initialization for browser
 * Exports traces to Honeycomb via OTLP
 */
import { WebTracerProvider, BatchSpanProcessor } from '@opentelemetry/sdk-trace-web';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ZoneContextManager } from '@opentelemetry/context-zone';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { XMLHttpRequestInstrumentation } from '@opentelemetry/instrumentation-xml-http-request';
import { DocumentLoadInstrumentation } from '@opentelemetry/instrumentation-document-load';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { trace, context } from '@opentelemetry/api';
import { clientEnv } from '../config/env';

// Deployment environment attribute (use raw string for compatibility)
const ATTR_DEPLOYMENT_ENVIRONMENT = 'deployment.environment';

let provider: WebTracerProvider | null = null;
let isInitialized = false;

/**
 * Build OTLP config from client env vars
 */
function getOtlpConfig(): { endpoint: string; headers: Record<string, string> } | null {
  // If using Honeycomb convenience vars
  if (clientEnv.HONEYCOMB_API_KEY) {
    return {
      endpoint: 'https://api.honeycomb.io:443/v1/traces',
      headers: {
        'x-honeycomb-team': clientEnv.HONEYCOMB_API_KEY,
        'x-honeycomb-dataset': clientEnv.HONEYCOMB_DATASET,
      },
    };
  }

  // Otherwise use raw OTLP vars
  if (clientEnv.OTEL_EXPORTER_OTLP_ENDPOINT) {
    const headers: Record<string, string> = {};

    // Parse comma-separated key=value pairs
    if (clientEnv.OTEL_EXPORTER_OTLP_HEADERS) {
      clientEnv.OTEL_EXPORTER_OTLP_HEADERS.split(',').forEach((pair) => {
        const [key, ...valueParts] = pair.split('=');
        if (key && valueParts.length > 0) {
          headers[key.trim()] = valueParts.join('=').trim();
        }
      });
    }

    return {
      endpoint: `${clientEnv.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`,
      headers,
    };
  }

  return null;
}

/**
 * Initialize OpenTelemetry Web SDK
 */
export function initOtel(): void {
  if (isInitialized) return;

  const config = getOtlpConfig();
  if (!config) {
    console.log(
      '[OTel] OpenTelemetry disabled (no VITE_HONEYCOMB_API_KEY or VITE_OTEL_EXPORTER_OTLP_ENDPOINT set)',
    );
    return;
  }

  const environment = clientEnv.IS_PRODUCTION ? 'production' : 'development';

  // Create resource with service info
  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: clientEnv.OTEL_SERVICE_NAME,
    [ATTR_SERVICE_VERSION]: clientEnv.OTEL_SERVICE_VERSION,
    [ATTR_DEPLOYMENT_ENVIRONMENT]: environment,
  });

  // Create trace exporter
  const exporter = new OTLPTraceExporter({
    url: config.endpoint,
    headers: config.headers,
  });

  // Create provider
  provider = new WebTracerProvider({
    resource,
    spanProcessors: [new BatchSpanProcessor(exporter)],
  });

  // Register with zone context manager for async context propagation
  provider.register({
    contextManager: new ZoneContextManager(),
  });

  // Register auto-instrumentations
  registerInstrumentations({
    instrumentations: [
      new FetchInstrumentation({
        // Propagate trace context to same-origin requests
        propagateTraceHeaderCorsUrls: [
          // Same origin
          new RegExp(`^${window.location.origin}`),
          // API URL if different
          ...(clientEnv.API_URL ? [new RegExp(`^${clientEnv.API_URL}`)] : []),
        ],
        // Clear timing resources to avoid memory leaks
        clearTimingResources: true,
        // Ignore tracking endpoints to avoid noise
        ignoreUrls: [/honeycomb\.io/, /otel/, /analytics/, /telemetry/],
      }),
      new XMLHttpRequestInstrumentation({
        propagateTraceHeaderCorsUrls: [
          new RegExp(`^${window.location.origin}`),
          ...(clientEnv.API_URL ? [new RegExp(`^${clientEnv.API_URL}`)] : []),
        ],
        clearTimingResources: true,
        ignoreUrls: [/honeycomb\.io/, /otel/, /analytics/, /telemetry/],
      }),
      new DocumentLoadInstrumentation(),
    ],
  });

  isInitialized = true;
  console.log(`[OTel] OpenTelemetry Web initialized - exporting to ${config.endpoint}`);
}

/**
 * Get current trace context
 */
export function getTraceContext(): { traceId?: string; spanId?: string } {
  if (!isInitialized) return {};

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
    // No active span
  }
  return {};
}

/**
 * Get a tracer for custom spans
 */
export function getTracer(name = 'live-draw-client') {
  if (!isInitialized) return null;
  return trace.getTracer(name);
}

/**
 * Record an error on the current span
 */
export function recordError(error: Error): void {
  if (!isInitialized) return;

  try {
    const span = trace.getSpan(context.active());
    if (span) {
      span.recordException(error);
    }
  } catch {
    // No active span
  }
}

/**
 * Shutdown OTel provider (for cleanup)
 */
export async function shutdownOtel(): Promise<void> {
  if (provider) {
    try {
      await provider.shutdown();
      console.log('[OTel] Web SDK shut down successfully');
    } catch (err) {
      console.error('[OTel] Error shutting down Web SDK:', err);
    }
  }
}

export { isInitialized as isOtelInitialized };
