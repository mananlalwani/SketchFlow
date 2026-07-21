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
