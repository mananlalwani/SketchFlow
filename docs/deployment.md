# Deployment

## Database migrations

Apply pending production migrations before starting a new application version:

```bash
pnpm --filter @sketchflow/server db:migrate:deploy
```

## Cloudflare Pages (Frontend)

1. Go to [Cloudflare Pages](https://pages.cloudflare.com)
2. Connect your GitHub repository
3. Configure build settings:
   - **Root directory**: `apps/client`
   - **Build command**: `pnpm build`
   - **Build output**: `dist`
4. Add environment variable:
   - `VITE_CLERK_PUBLISHABLE_KEY` = your Clerk publishable key
5. Deploy

Your app will be live at `https://your-project.pages.dev`

## Optional: Backend

For the full real-time sync features, you'll need a backend server. For portfolio demos, you can:

- Run locally: `pnpm dev` and demo on localhost
- Deploy to any Node hosting (Railway, Render, Fly.io)

The frontend works standalone for drawing - real-time sync just won't work without the backend.

---

## Observability (OpenTelemetry + Honeycomb)

The application includes full OpenTelemetry instrumentation for traces, logs, and error tracking. By default, telemetry is **disabled** unless you provide the appropriate environment variables.

### Honeycomb (Recommended - Free Tier Available)

[Honeycomb](https://www.honeycomb.io/) offers a generous free tier and excellent trace visualization.

#### Server Environment Variables

```bash
# Honeycomb convenience variables (recommended)
HONEYCOMB_API_KEY=your-honeycomb-api-key
HONEYCOMB_DATASET=live-draw  # optional, defaults to 'live-draw'

# Service identification
OTEL_SERVICE_NAME=live-draw-server  # optional
OTEL_SERVICE_VERSION=1.0.0          # optional, uses package.json version if not set

# Logging configuration
LOG_LEVEL=info      # debug | info | warn | error
LOG_FORMAT=json     # json | pretty (json recommended for production)
```

#### Client Environment Variables (Vite)

```bash
# Honeycomb convenience variables (recommended)
VITE_HONEYCOMB_API_KEY=your-honeycomb-api-key
VITE_HONEYCOMB_DATASET=live-draw  # optional

# Service identification
VITE_OTEL_SERVICE_NAME=live-draw-client  # optional
VITE_OTEL_SERVICE_VERSION=1.0.0          # optional
```

### Alternative: Raw OTLP Configuration

If using a different OTLP-compatible backend (Grafana Cloud, Jaeger, etc.):

#### Server

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=https://your-otlp-endpoint:443
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer your-token,X-Custom-Header=value
```

#### Client

```bash
VITE_OTEL_EXPORTER_OTLP_ENDPOINT=https://your-otlp-endpoint:443
VITE_OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer your-token
```

### What Gets Instrumented

**Server (Node.js):**
- HTTP requests/responses (Express)
- Database queries (Prisma)
- Socket.IO events
- Custom application logs with trace correlation

**Client (Browser):**
- Fetch/XHR requests
- Document load timing
- User interactions
- Error tracking with trace correlation

### Log Correlation

All server logs automatically include `traceId` and `spanId` when OpenTelemetry is active. This allows you to correlate logs with traces in Honeycomb.

Example log output (JSON format):
```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "level": "info",
  "message": "GET /api/projects 200",
  "requestId": "abc123",
  "traceId": "1234567890abcdef",
  "spanId": "fedcba0987654321",
  "method": "GET",
  "url": "/api/projects",
  "statusCode": 200,
  "durationMs": 45
}
```

### Security & Redaction

The logger automatically redacts sensitive fields from logs:
- Authorization headers
- Cookies
- Tokens (API keys, JWTs, session tokens)
- Passwords
- Clerk-related fields

### Disabling Telemetry

Simply don't set the `HONEYCOMB_API_KEY` or `OTEL_EXPORTER_OTLP_ENDPOINT` environment variables. The application will run normally with local console logging only.

## Operational runbook

### Release checklist

1. Confirm CI release gate is green for the exact commit being deployed.
2. Confirm `pnpm audit:prod` has no high or critical production findings.
3. Confirm environment validation passes in staging with production-equivalent `DATABASE_URL`, `CLERK_SECRET_KEY`, and `CORS_ORIGINS`.
4. Apply database migrations with `pnpm --filter @sketchflow/server db:migrate:deploy` before shifting traffic.
5. Deploy the image by immutable SHA, not by a mutable local tag.
6. Verify `/api/readyz`, `/api/health`, project creation, project save, share-link read, and Socket.IO room join.
7. Watch request latency, API 5xx rate, database saturation, socket reconnects, and client error rate for at least 30 minutes.

### Rollback

1. Stop the rollout immediately when readiness, persistence, authorization, or realtime collaboration smoke checks fail.
2. Roll back to the previous image SHA.
3. If a migration is involved, follow the migration note attached to the release; never run destructive rollback SQL without a fresh backup.
4. Re-run smoke checks and keep the incident open until dashboards return to baseline.

### Incident response

1. Assign an incident lead and record the timeline in the incident channel.
2. Classify impact: authentication, persistence, realtime, performance, or external dependency.
3. Prefer safe degradation: disable realtime fan-out, pause writes, or make affected boards read-only before risking data loss.
4. Preserve logs, traces, metrics, and database snapshots needed for post-incident analysis.
5. Publish a postmortem with root cause, customer impact, detection gap, and follow-up owners.

### Backup and restore drills

- Take automated database backups at least daily for production.
- Test restore into an isolated environment at least quarterly.
- Record recovery time objective, recovery point objective, backup age, restore duration, validation steps, and owner sign-off.

### Redis failure mode

- Multi-instance realtime deployments require Redis for Socket.IO fan-out.
- If Redis is unavailable, keep HTTP project access available, block horizontal realtime scale-out, and route collaboration traffic to a single instance only when explicitly approved.
- Alert on Redis connection failures and socket adapter errors.

### Clerk outage mode

- Existing sessions may continue until expiry if token verification remains available.
- New sign-ins, share-management writes, and collaborator-management writes should be considered degraded.
- Keep public status messaging separate from sensitive authentication details.

### Dashboards and alerts

Dashboards must include request latency, API error rate, database health, migration status, socket connection count, reconnect rate, collaboration conflicts, Redis adapter health, client error rate, and release version. Page on sustained readiness failures, elevated 5xxs, database exhaustion, Redis fan-out failures, or authentication verification failures.
