# Deployment

SketchFlow has a split production deployment:

- **Cloudflare Pages** serves the React client at `draw.mananlalwani.com`.
- The **VPS Docker container** serves the Express API and Socket.IO at the API origin.

Cloudflare Pages is connected to `main`, so a client-only change deploys from that integration. It
does not need a new GHCR image or VPS restart. The API origin remains the source of truth for
authentication, persistence, and collaboration.

## Before deploying

For a manual migration or deployment, apply Prisma migrations against the production database:

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

## What deploys where

| Change                                                                        | Deploy action                                                                   |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `apps/client/**` only                                                         | Push to `main`; Cloudflare Pages publishes the frontend. No Docker work.        |
| `apps/server/**`, `packages/shared/**`, dependency manifests, or `Dockerfile` | GitHub Actions builds and publishes a new GHCR image; the VPS timer deploys it. |

The `main` CI workflow detects this automatically: frontend-only commits skip the expensive
container build and image publish jobs. It still runs the normal test and quality checks.

## Automatic VPS backend deployment

The VPS checks the public GHCR `latest` image once per minute using the
`sketchflow-image-update.timer` systemd timer. When the image digest changes, it pulls the image,
applies Prisma migrations, replaces `live-draw`, and verifies `/api/health`. The installed files
are `/opt/sketchflow/deploy-vps-image.sh`, `/etc/systemd/system/sketchflow-image-update.service`,
and `/etc/systemd/system/sketchflow-image-update.timer`.

To inspect it on the VPS:

```bash
systemctl status sketchflow-image-update.timer
journalctl -u sketchflow-image-update.service
```

## Manual VPS backend deployment

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
`/api/health` through the API origin after restart. The client is served separately by Cloudflare
Pages at `draw.mananlalwani.com`.

## Image and GitHub releases

Pushing a `v*` tag is an explicit backend release: it validates the source, publishes both the
versioned GHCR image and `latest`, then creates a GitHub Release. The VPS timer picks up the new
`latest` image automatically. Use the versioned image tag for a reproducible manual rollback.

## Optional observability

Server OpenTelemetry starts when `OTEL_EXPORTER_OTLP_ENDPOINT` or `HONEYCOMB_API_KEY` is set.
Sentry starts when `SENTRY_DSN` is set. These integrations should be configured only after provider
credentials, origin restrictions, retention, and alerting have been reviewed; see
[`monitoring.md`](monitoring.md).

## Uptime alerts

The `Uptime monitor` workflow checks the VPS backend origin every five minutes and sends a Discord
message when it stops returning a successful HTTP status. It checks the origin directly to avoid
Cloudflare bot protection causing false positives. Add these GitHub Actions repository secrets:

- `DISCORD_WEBHOOK_URL`: Discord incoming webhook URL.
- `UPTIME_ORIGIN_URL`: backend origin, for example `http://your-vps-address:4967`.

The monitor skips checks when the origin secret is not configured.
