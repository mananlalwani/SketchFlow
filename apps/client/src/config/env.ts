/**
 * Client-side environment configuration
 * Validates Vite's import.meta.env variables at runtime
 */

interface ClientEnv {
  CLERK_PUBLISHABLE_KEY: string;
  API_URL: string;
  WS_URL: string;
  IS_PRODUCTION: boolean;
  // OpenTelemetry / Honeycomb (optional)
  OTEL_ENABLED: boolean;
  OTEL_EXPORTER_OTLP_ENDPOINT: string;
  OTEL_EXPORTER_OTLP_HEADERS: string;
  OTEL_SERVICE_NAME: string;
  OTEL_SERVICE_VERSION: string;
  HONEYCOMB_API_KEY: string;
  HONEYCOMB_DATASET: string;
}

function getClientEnv(): ClientEnv {
  // In Vite, environment variables are exposed via import.meta.env
  const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

  if (!clerkKey) {
    console.error('❌ VITE_CLERK_PUBLISHABLE_KEY is required');
    // Don't crash in browser - show error in console
  }

  // API URL defaults to current origin (for same-origin deployment)
  const apiUrl = import.meta.env.VITE_API_URL || '';

  // WebSocket URL defaults to API URL (or empty for same origin)
  const wsUrl = import.meta.env.VITE_WS_URL || apiUrl;

  // OpenTelemetry / Honeycomb config
  const honeycombKey = import.meta.env.VITE_HONEYCOMB_API_KEY || '';
  const otlpEndpoint = import.meta.env.VITE_OTEL_EXPORTER_OTLP_ENDPOINT || '';
  const otelEnabled = !!(honeycombKey || otlpEndpoint);

  return {
    CLERK_PUBLISHABLE_KEY: clerkKey || '',
    API_URL: apiUrl,
    WS_URL: wsUrl,
    IS_PRODUCTION: import.meta.env.PROD,
    // OpenTelemetry
    OTEL_ENABLED: otelEnabled,
    OTEL_EXPORTER_OTLP_ENDPOINT: otlpEndpoint,
    OTEL_EXPORTER_OTLP_HEADERS: import.meta.env.VITE_OTEL_EXPORTER_OTLP_HEADERS || '',
    OTEL_SERVICE_NAME: import.meta.env.VITE_OTEL_SERVICE_NAME || 'live-draw-client',
    OTEL_SERVICE_VERSION: import.meta.env.VITE_OTEL_SERVICE_VERSION || '1.0.0',
    HONEYCOMB_API_KEY: honeycombKey,
    HONEYCOMB_DATASET: import.meta.env.VITE_HONEYCOMB_DATASET || 'live-draw',
  };
}

export const clientEnv = getClientEnv();
