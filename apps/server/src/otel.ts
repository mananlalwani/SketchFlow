/**
 * OpenTelemetry initialization for Node.js server
 * Must be imported before any other modules to enable auto-instrumentation
 */
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';

// Deployment environment attribute (use raw string if not available in installed version)
const ATTR_DEPLOYMENT_ENVIRONMENT = 'deployment.environment';

// Check if OTel is enabled via env vars
const isOtelEnabled = !!(
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||
  process.env.HONEYCOMB_API_KEY
);

// Build OTLP endpoint and headers from env
function getOtlpConfig(): { endpoint: string; headers: Record<string, string> } {
  // If using Honeycomb convenience vars
  if (process.env.HONEYCOMB_API_KEY) {
    const dataset = process.env.HONEYCOMB_DATASET || 'live-draw';
    return {
      endpoint: 'https://api.honeycomb.io:443',
      headers: {
        'x-honeycomb-team': process.env.HONEYCOMB_API_KEY,
        'x-honeycomb-dataset': dataset,
      },
    };
  }

  // Otherwise use raw OTLP vars
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318';
  const headersStr = process.env.OTEL_EXPORTER_OTLP_HEADERS || '';
  const headers: Record<string, string> = {};

  // Parse comma-separated key=value pairs
  if (headersStr) {
    headersStr.split(',').forEach((pair) => {
      const [key, ...valueParts] = pair.split('=');
      if (key && valueParts.length > 0) {
        headers[key.trim()] = valueParts.join('=').trim();
      }
    });
  }

  return { endpoint, headers };
}

let sdk: NodeSDK | null = null;

if (isOtelEnabled) {
  const { endpoint, headers } = getOtlpConfig();

  const serviceName = process.env.OTEL_SERVICE_NAME || 'live-draw-server';
  const serviceVersion = process.env.OTEL_SERVICE_VERSION || process.env.npm_package_version || '1.0.0';
  const environment = process.env.NODE_ENV || 'development';

  // Create resource with service info
  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: serviceName,
    [ATTR_SERVICE_VERSION]: serviceVersion,
    [ATTR_DEPLOYMENT_ENVIRONMENT]: environment,
  });

  // Create trace exporter
  const traceExporter = new OTLPTraceExporter({
    url: `${endpoint}/v1/traces`,
    headers,
  });

  // Initialize SDK with auto-instrumentations
  sdk = new NodeSDK({
    resource,
    traceExporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        // Disable fs instrumentation (too noisy)
        '@opentelemetry/instrumentation-fs': { enabled: false },
        // Configure HTTP instrumentation
        '@opentelemetry/instrumentation-http': {
          ignoreIncomingRequestHook: (req) => {
            // Ignore health checks to reduce noise
            const url = req.url || '';
            return url.includes('/api/health') || url.includes('/api/healthz') || url.includes('/api/readyz');
          },
        },
      }),
    ],
  });

  sdk.start();

  console.log(`[OTel] OpenTelemetry initialized - exporting to ${endpoint}`);

  // Graceful shutdown
  const shutdown = async () => {
    if (sdk) {
      try {
        await sdk.shutdown();
        console.log('[OTel] SDK shut down successfully');
      } catch (err) {
        console.error('[OTel] Error shutting down SDK:', err);
      }
    }
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
} else {
  console.log('[OTel] OpenTelemetry disabled (no OTEL_EXPORTER_OTLP_ENDPOINT or HONEYCOMB_API_KEY set)');
}

export { sdk, isOtelEnabled };
