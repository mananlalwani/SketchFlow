# SketchFlow: roadmap to a 9–10/10 codebase

## Goal and definition of done

This plan turns the current strong foundation into a production-grade application. A 9–10/10 outcome means:

- no tracked secrets or unreviewed high/critical production dependency findings;
- every pull request passes unit, integration, browser E2E, accessibility, type, lint, build, and container checks;
- project access, sharing, and realtime permissions are enforced on the server;
- acknowledged work survives refreshes, reconnects, restarts, and concurrent edits predictably;
- the first-load and large-board experience meet explicit performance budgets;
- the codebase has clear module ownership and is straightforward to change safely.

## Phase 1 — Secure the repository and release process

**Priority:** P0 — complete before the next production release.

- [ ] Remove `.env`, `apps/client/.env`, and `apps/server/.env` from Git history and current tracking. Rotate every credential that was ever present in them.
- [x] Add `.env`, `.env.*`, and application-specific variants to `.gitignore`; explicitly allow only `*.env.example` templates.
- [x] Create root, client, and server `.env.example` files containing variable names, safe examples, and short descriptions.
- [x] Make production startup fail fast when `CLERK_SECRET_KEY`, `DATABASE_URL`, or a non-empty `CORS_ORIGINS` allowlist is missing or invalid.
- [x] Make dependency audit policy enforce zero critical/high findings. Track each remaining moderate finding with owner, reachability, remediation version, and review date in `docs/dependency-audit.md`.
- [x] Add Dependabot or Renovate for weekly dependency PRs and monthly lockfile refreshes.
- [x] Protect `main`: require CI, at least one review, and no direct pushes.

**Verify:** `git ls-files '*env'` returns only example files; `pnpm audit --prod --audit-level high` exits cleanly; a production startup with an incomplete environment exits non-zero.

## Phase 2 — Make CI a complete release gate

**Priority:** P0.

- [x] Add a server ESLint configuration and include both client and server linting in `pnpm lint`.
- [x] Add `pnpm format:check` using Prettier (or Biome) and make formatting non-negotiable in CI.
- [x] Run Playwright E2E tests in CI with a disposable PostgreSQL service and deterministic test authentication.
- [ ] Add an accessibility CI job using axe-core for the draw surface, toolbar, dialogs, project manager, and share flow.
- [ ] Publish coverage artifacts and set ratcheting thresholds: 80% lines/functions globally, 90% for authorization, validation, persistence, and socket-boundary modules.
- [x] Keep the Docker smoke test, but use readiness (`/api/readyz`) with a real CI database instead of liveness alone.
- [ ] Add a migration test: apply all migrations to a clean database, start the production image, then verify the critical project lifecycle.

**Verify:** a pull request cannot merge unless lint, format, type-check, unit/integration/E2E/accessibility tests, audit, build, migration, and container checks pass.

## Phase 3 — Prove authorization and realtime correctness

**Priority:** P0.

- [ ] Write a permission matrix covering owner, editor, viewer, anonymous user, valid public-link visitor, expired/revoked link visitor, and guessed project ID.
- [ ] Add REST integration tests for every matrix cell: project read/write/delete, folders, collaborators, sharing, and revision conflicts.
- [ ] Add Socket.IO integration tests for handshake identity, project-room authorization, editor/viewer behavior, session expiry, rate limits, and reconnects.
- [ ] Require server-side authorization before every room join and every socket mutation; never trust client-provided role, project, or share flags.
- [ ] Enforce public share-link scope, expiration, revocation, and read-only behavior in both HTTP and Socket.IO paths.
- [ ] Add payload and operation limits for project saves, snapshot size, object count, image data, socket messages, and event frequency. Return explicit `400`, `403`, `409`, `413`, and `429` errors.

**Verify:** automated matrix tests show no unauthorized read, join, or mutation path. Security tests include malformed values, stale sessions, and guessed IDs/tokens.

## Phase 4 — Make collaboration durable and deterministic

**Priority:** P0 for multi-user production use.

- [ ] Document the collaboration model and choose one: server-ordered operations, CRDT, or explicit conflict resolution. Record ordering, merge, and undo semantics in an ADR.
- [ ] Persist acknowledged operations or snapshots transactionally; process-memory state must be an optimization, never the source of truth.
- [ ] Use project revisions/conditional writes for all saves and return a typed conflict response containing the current revision.
- [ ] Implement client conflict UX: retry when safe; otherwise present reload/duplicate/export recovery choices without losing local work.
- [ ] Make offline work an ordered queue in IndexedDB, with bounded storage, retry backoff, conflict handling, and clear recovery status.
- [ ] Require Redis (or equivalent) for horizontally scaled realtime deployments; document the one-instance development fallback separately.
- [ ] Add restart, disconnect/reconnect, two-editor, delayed-message, offline replay, and multi-instance integration tests.

**Verify:** a test suite proves that acknowledged edits survive server restart and that simultaneous edits have documented, deterministic outcomes.

## Phase 5 — Improve performance and resilience with budgets

**Priority:** P1.

- [ ] Establish CI-measured budgets: initial JS ≤ 300 kB gzip (excluding deferred features), LCP ≤ 2.5 s on the chosen mobile profile, INP ≤ 200 ms, CLS ≤ 0.1, and no uncaught error during a 10,000-object board scenario.
- [ ] Lazy-load PDF import/export and any other infrequently used tooling. Confirm it is absent from the initial route bundle.
- [ ] Split `DrawingCanvas` rendering, input, selection, transform, viewport, persistence, and collaboration adapters into focused modules; preserve behavior with tests during each extraction.
- [ ] Add a reproducible 10,000-object benchmark measuring frame time, visible-object count, memory trend, pan/zoom latency, and worker throughput.
- [ ] Use viewport culling, batching, and worker rendering only where profiling identifies a bottleneck; record before/after profiles in `docs/performance.md`.
- [ ] Add production error monitoring with private source-map upload, release identifiers, and alerts for client errors, API 5xxs, socket disconnects, and persistence conflicts.
- [ ] Exercise PWA offline, update, and recovery flows in browser tests; never cache authenticated API responses unless explicitly designed for it.

**Verify:** CI retains benchmark results and build reports; all budgets pass on the reference profile; PDF code is loaded only when its feature is invoked.

## Phase 6 — Finish maintainability work

**Priority:** P1.

- [ ] Establish module size guidance: aim for ≤ 400 lines per component/service; require an architectural note and owner approval for exceptions.
- [ ] Break up `DrawingCanvas.tsx` (currently ~2,900 lines), `src/index.ts` on the server (~1,000 lines), and `ProjectService.ts` (~860 lines) around tested interfaces.
- [ ] Make `packages/shared` the single source of truth for socket contracts and project domain types. Eliminate the duplicated client/server socket definitions.
- [ ] Replace `Record<string, any>` and Socket.IO casts with discriminated domain types or validated unknown values at the boundary.
- [ ] Remove production `console.log` calls from shape detection; use structured, level-controlled telemetry where diagnostics are needed.
- [ ] Adopt structured error types (validation, authorization, conflict, not-found, infrastructure) and one centralized HTTP/socket error mapping policy.
- [ ] Add architecture decision records for auth/share links, collaboration conflict behavior, offline strategy, scaling, and rendering boundaries.

**Verify:** the three largest modules are split into cohesive, tested units; no duplicated socket contracts remain; lint rules prevent new unsafe boundary types.

## Phase 7 — Polish product quality and operations

**Priority:** P2.

- [ ] Audit keyboard navigation, focus traps, canvas alternatives, ARIA labels, contrast, touch targets, reduced motion, and screen-reader announcements; resolve all serious axe findings.
- [ ] Write a runbook for deploys, migrations, rollback, incident response, database backup/restore, Redis failure, Clerk outage, and degraded realtime mode.
- [ ] Implement backup/restore drills at least quarterly and record recovery time and data-loss objectives.
- [ ] Add dashboards for request latency/error rate, database health, socket connections/reconnects, collaboration conflicts, and client error rate.
- [ ] Add a release checklist with migration order, environment validation, rollout health signals, rollback criteria, and post-deploy smoke tests.

**Verify:** a new engineer can execute a staged deployment and rollback from the runbook; accessibility and operational checks are part of the release gate.

## Recommended execution order

1. Phase 1: secret hygiene and dependency policy.
2. Phase 2: CI gates, especially E2E/migration/container validation.
3. Phase 3: authorization matrix and socket boundary proof.
4. Phase 4: collaboration durability and conflict design.
5. Phase 5 and Phase 6 in parallel after the collaboration contract stabilizes.
6. Phase 7 as the final operational-quality pass.

## Scorecard

| Area            | Current signal                                           | Target for 9–10/10                                          |
| --------------- | -------------------------------------------------------- | ----------------------------------------------------------- |
| Build quality   | Tests, lint, types, and builds pass                      | Full client/server/E2E/a11y/migration release gate          |
| Security        | Good validation/rate-limit foundation; tracked env files | No tracked secrets; proven server-side authorization        |
| Reliability     | Realtime and persistence foundations                     | Restart/offline/concurrent-edit recovery proven by tests    |
| Performance     | Production build warns about large chunks                | Explicit, CI-enforced loading and board-performance budgets |
| Maintainability | Large central modules and duplicate contracts            | Focused modules, shared contracts, typed boundaries         |
| Operations      | Health probes and Docker build exist                     | Runbooks, dashboards, drills, alerting, safe releases       |
