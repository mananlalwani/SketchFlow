# Monitoring runbook

SketchFlow contains optional server OpenTelemetry and optional client/server Sentry integration. None
is active until its corresponding deployment configuration is supplied.

## What the code does

- Server OpenTelemetry starts with `OTEL_EXPORTER_OTLP_ENDPOINT` or `HONEYCOMB_API_KEY` and exports
  server traces. It is disabled by default.
- Sentry starts on the server with `SENTRY_DSN` and in the built client with `VITE_SENTRY_DSN`.
- Browser OpenTelemetry is deliberately disabled; do not put OTLP endpoints, headers, or API keys in
  `VITE_*` variables.
- Error filtering removes request bodies, cookies, headers, query strings, share tokens, user data,
  and canvas/project payloads. Do not add those fields to telemetry manually.

## Optional configuration

Server runtime values:

```env
SENTRY_DSN=https://public-key@example.ingest.sentry.io/0
SENTRY_ENVIRONMENT=production
RELEASE_ID=v2.0.0
OTEL_EXPORTER_OTLP_ENDPOINT=https://collector.example
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer%20token
```

Client Sentry values must be present when the Vite client is built, not only when the server starts:

```env
VITE_SENTRY_DSN=https://public-key@example.ingest.sentry.io/0
VITE_SENTRY_ENVIRONMENT=production
VITE_RELEASE_ID=v2.0.0
```

Source-map upload needs `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` during a credentialed
Docker build. The current tag-release workflow does not configure those credentials, so it does not
claim source-map upload or provider validation.

## Before enabling providers

1. Restrict the browser DSN to the intended application origins.
2. Verify a handled test error has the correct release/environment and no sensitive request data.
3. Configure retention, access controls, and alerts in the provider.
4. If source maps are enabled, verify they upload privately and are absent from the delivered image.
