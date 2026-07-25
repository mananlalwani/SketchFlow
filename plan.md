# SketchFlow beta roadmap

This is a current-state roadmap, not evidence that every production control is complete.

## Implemented in the repository

- React/Vite client, Express/Socket.IO server, PostgreSQL/Prisma persistence, Clerk authentication,
  and optional Redis coordination for multi-instance Socket.IO.
- Server-ordered collaboration operations with transactional receipts, object upsert/delete/batches,
  revisioned canonical state, and deterministic server-order handling for competing writes to one
  object.
- IndexedDB persistence for unsent collaboration operations; reconnect/restart replay and canonical
  hydration for revision gaps.
- Live cursors keyed by browser session so multiple devices under the same account remain visible.
- Pressure-point stroke widths retained through save/load/render/export, worker rendering with a
  main-thread fallback, PWA shell recovery, and opt-in auto-shape detection.
- GitHub Actions checks for build, unit/server integration tests, lint, type checks, production
  dependency audit, secret scanning, Docker build/smoke, and GHCR publication from `main`.
- `v*` tags validate, publish versioned GHCR images plus `latest`, and create GitHub Releases.
  VPS deployment is intentionally manual.

## Validation currently run on `main`

- Shared/client/server build; client type check; client/server Vitest suites; lint; production audit.
- Docker image build and a health/draw-route smoke test.
- Gitleaks on pushes, pull requests, and a weekly schedule.

Playwright E2E, PostgreSQL/Redis infrastructure testing, performance benchmarks, formatting, and
coverage are available locally but are not current required GitHub Actions gates.

## Remaining beta work

1. Run authenticated two-browser tests against the deployed app: same-account cursors, different
   object edits, competing same-object edits, reconnect, and offline replay.
2. Configure Redis and `SOCKET_INSTANCE_COUNT` before scaling the API past one instance.
3. Decide whether to enable Sentry/OpenTelemetry; if enabled, complete provider-side privacy,
   retention, source-map, and alert validation.
4. Add an authenticated Playwright job and infrastructure tests to CI before making stronger
   performance or end-to-end reliability claims.
5. Keep a tested manual VPS deploy/rollback runbook and pin a versioned GHCR image for releases.

## Local checks

```bash
pnpm build
pnpm test
pnpm lint
pnpm format:check
pnpm test:infrastructure
pnpm --filter @sketchflow/client test:e2e
pnpm check:client-budgets
```

## Production configuration

Required: `DATABASE_URL`, Clerk keys, and explicit `CORS_ORIGINS`. Redis is required only for more
than one Socket.IO instance. Sentry, OpenTelemetry, and release identifiers are optional; see
[`docs/deployment.md`](docs/deployment.md) and [`docs/monitoring.md`](docs/monitoring.md).
