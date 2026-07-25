# Deployment

SketchFlow is deployed as one Docker image: the Express/Socket.IO server serves the built React
client. The current production model is a manually promoted VPS container, not Cloudflare Pages.

## Before deploying

Apply Prisma migrations against the production database:

```bash
pnpm --filter @sketchflow/server db:migrate:deploy
```

The runtime requires `DATABASE_URL`, `CLERK_SECRET_KEY`, and explicit `CORS_ORIGINS`. Use a
`CORS_ORIGINS` value of `https://draw.mananlalwani.com` for the current public client. Configure
`REDIS_URL` only when running more than one Socket.IO instance, together with
`SOCKET_INSTANCE_COUNT`.

Sentry, OpenTelemetry, and `RELEASE_ID` are optional. They are not required for the application to
start. Browser OpenTelemetry is intentionally disabled: never expose OTLP credentials or headers in
a `VITE_*` variable.

## Manual VPS deployment

After GitHub Actions has published the image, pull and restart it on the VPS using the existing
container port and environment values. Prefer an `--env-file` stored only on the VPS over putting
credentials on the command line.

```bash
docker pull ghcr.io/mananlalwani/sketchflow:latest
docker rm -f live-draw 2>/dev/null || true
docker run -d --name live-draw --env-file /opt/sketchflow/.env \
  -p 4967:4967 --restart unless-stopped \
  ghcr.io/mananlalwani/sketchflow:latest
```

The environment file should include `PORT=4967` when the host maps port 4967 directly. Verify
`/api/health` through the API origin and open `/draw` through the client origin after restart.

## Image and GitHub releases

Pushing a `v*` tag runs the release workflow: it validates the source, publishes both the versioned
GHCR image and `latest`, then creates a GitHub Release. It intentionally does not deploy the VPS.
Use the image tag for a reproducible rollback or use `latest` for the newest successful main build.

## Optional observability

Server OpenTelemetry starts when `OTEL_EXPORTER_OTLP_ENDPOINT` or `HONEYCOMB_API_KEY` is set.
Sentry starts when `SENTRY_DSN` is set. These integrations should be configured only after provider
credentials, origin restrictions, retention, and alerting have been reviewed; see
[`monitoring.md`](monitoring.md).
