# Monitoring runbook

Sketchflow uses OpenTelemetry for tracing and Sentry for error monitoring. Sentry is disabled unless a DSN is supplied.

## Configuration

Configure these runtime values in deployment secret/config storage:

- Client build: `VITE_SENTRY_DSN`, `VITE_SENTRY_ENVIRONMENT`, and `VITE_RELEASE_ID`.
- Server runtime: `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, and `RELEASE_ID`.
- Private source-map upload only: `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT`.

`VITE_RELEASE_ID` and `RELEASE_ID` must use the same immutable release identifier (normally the Git commit SHA). A Sentry auth token must be supplied to Docker only as the BuildKit secret `sentry_auth_token`; never make it a `VITE_*` value, Docker argument/environment value, image-layer file, or application runtime variable.

A normal CI build deliberately has no Sentry credentials. The Docker build verifies that the final client distribution contains no `.map` files or `sourceMappingURL` comments. A credentialed deployment build generates hidden maps, uploads them with the configured release, and deletes them before its public artifact is copied into the final image.

## Privacy controls

Sentry runs with `sendDefaultPii: false` and tracing disabled because tracing is owned by OpenTelemetry. Client and server filters remove request bodies, cookies, headers, query strings, share tokens, users, and sensitive event fields. Do not attach canvas objects, drawing text, images, project titles, raw socket payloads, emails, raw user IDs, or authentication data to an error/signal context.

Use route templates, status/reason enums, release/environment values, trace/span correlation IDs, and the approved `auth.state` tag only.

## Provider setup and release validation

1. Create separate Sentry environments for staging and production and restrict the browser DSN to Sketchflow origins.
2. Configure the deployment secret/config values above. Do not configure the upload token in pull-request CI.
3. Deploy a non-production release with an intentionally handled test exception.
4. Confirm the Sentry event has the expected release/environment, no sensitive request data, and the OpenTelemetry trace/span IDs where available.
5. Confirm stack frames symbolize for that release, then inspect the delivered `/app/client/dist` artifact/image and verify maps and map comments are absent.

## Required alerts

Configure provider-side alerts with environment and release filters:

1. **Client exception regression:** alert on a new issue or an exception-rate increase over the established baseline.
2. **API 5xx rate:** alert on `api_5xx` warning signals above the production baseline for five minutes.
3. **Abnormal socket rate:** alert on `socket_adapter_error` or `socket_reconnect_exhausted` signals above baseline for five minutes.
4. **Persistence conflict rate:** alert on `persistence_conflict` signals above baseline for five minutes.

Start thresholds conservatively and tune them using a staging period; do not alert on normal authentication, permission, validation, rate-limit, or ordinary disconnect events.

## Triage

- Check the release, environment, route/status or signal tag, and linked trace/span identifiers.
- Use OpenTelemetry traces for request and socket timelines; do not add high-cardinality payload data to Sentry while investigating.
- For an unexpected sensitive value, disable the affected DSN, remove the event according to the provider retention policy, fix the sanitizer, and add a regression test before re-enabling delivery.
