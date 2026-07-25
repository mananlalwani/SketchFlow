# SketchFlow public-release roadmap

## Goal and definition of done

This roadmap records what has been implemented and independently verified for a public-release-ready repository. A completed repository phase requires repeatable local evidence; provider-side actions are deliberately tracked separately and are **not** marked complete without evidence from the relevant account.

A public release is ready only when:

- no secrets, non-example environment files, generated build outputs, source maps, reports, or credentials are tracked or included in the production image;
- required checks cover formatting, lint, types, build, unit/boundary tests, real PostgreSQL/Redis integration, browser/accessibility checks, release hygiene, dependency policy, and production-image lifecycle;
- project access, sharing, and realtime permissions are enforced by the server;
- project data and revision are canonical, acknowledged work survives restart/reconnect, and conflicting writes have deterministic recovery semantics;
- performance assertions prove correctness and gross-stall resistance for the supported board size;
- external release governance, credentials, registry settings, and observability validation have been completed by the release owner.

## Current local verification snapshot

The following commands have passed in this working tree after the current Phase 1–5 implementation work:

```sh
pnpm build
pnpm type-check
pnpm lint
pnpm test:infrastructure
pnpm --filter @sketchflow/client test
pnpm --filter @sketchflow/client test:e2e
pnpm check:release-hygiene
pnpm audit:prod
git diff --check
```

`pnpm audit:prod` correctly enforces the configured high/critical threshold, but its last run still reported **2 low and 9 moderate** findings. Those findings remain documented remediation/review work; a passing configured threshold is not the same as a finding-free dependency inventory.

A workspace-wide formatting check also previously passed. It must be run from a clean workspace that excludes temporary agent worktrees; recursive Prettier globbing can otherwise inspect `.claude/worktrees/` copies that are not part of the release tree.

## Phase 1 — Secure the repository and release process

**Priority:** P0.

**Repository-local status:** substantially complete and verified. **Release-owner status:** incomplete until provider-side evidence is recorded.

- [x] Ignore nested `.env` and `.env.*` files while allowing only `.env.example` templates; exclude generated distributions, maps, coverage, browser reports/results, logs, and local telemetry output from Git and Docker build context.
- [x] Provide root, client, and server `.env.example` templates with safe variable names and guidance.
- [x] Make production server startup reject missing/invalid required Clerk, database, and CORS configuration.
- [x] Add release-hygiene checks that reject tracked environment files, generated outputs, maps, coverage, reports, and browser artifacts.
- [x] Add Docker-context/final-image auditing and use BuildKit secrets—not Docker `ARG` or `ENV`—for optional Sentry source-map uploads.
- [x] Keep browser telemetry configuration public-only; do not expose private telemetry headers, upload tokens, or credentials through `VITE_*` values or browser assets.
- [x] Add public-release documentation and repository policy material, including security/release/dependency-audit guidance.
- [x] Configure the repository policy to fail `pnpm audit --prod --audit-level high` for high/critical production findings and document the remaining low/moderate findings.
- [x] Prepare pinned/least-privilege CI workflow configuration, dependency maintenance, and publication supply-chain controls in the repository.
- [ ] Rotate, revoke, or positively verify every potentially exposed Clerk, database, Sentry/telemetry, deployment, and registry credential before publishing a clean export.
- [ ] Verify GitHub secret scanning/push protection, branch rulesets, required reviews/status checks, artifact retention, cache/log exposure, and remote branches/tags in the actual hosted repository.
- [ ] Configure and verify package/image visibility, signing, SBOM/provenance publication, and registry retention in the target public registry.

**Verify locally:** `pnpm check:release-hygiene`, `pnpm audit:prod`, Docker context/image audit, and a production startup with incomplete environment configuration.

**Release-owner evidence required:** credential verification/rotation record, hosted GitHub policy screenshots or API evidence, and registry/signing/provenance evidence.

## Phase 2 — Make CI a complete release gate

**Priority:** P0.

**Repository-local status:** core gates and disposable real-infrastructure coverage are implemented. Hosted CI execution and final coverage ratcheting remain open evidence/work.

- [x] Enforce client and server linting through `pnpm lint`.
- [x] Enforce formatting through `pnpm format:check`.
- [x] Build shared, client, and server packages and type-check the client in release scripts.
- [x] Add disposable loopback-only PostgreSQL 16 and Redis 7 services with tmpfs data, dynamic host ports, health checks, migrations, and guaranteed teardown.
- [x] Add `pnpm test:infrastructure`, which proves real PostgreSQL project CAS/idempotency/cascade behavior and Redis-backed multi-instance Socket.IO behavior.
- [x] Invoke the canonical disposable-infrastructure harness from CI rather than relying only on mocked integration tests.
- [x] Run browser, accessibility, PWA update/recovery, web-vitals, and separate 10,000-object renderer benchmark suites in CI configuration.
- [x] Test production-image readiness with a real database, migrations, a seeded shared-project fixture, and draw/shared-project smoke checks.
- [x] Prevent image publishing unless test and container jobs complete; production image publication is restricted to `main` and uses BuildKit secrets for optional source-map upload.
- [~] Publish and ratchet coverage to **80% global lines/functions** and **90% critical-module lines/functions**. Coverage scripts/artifacts and baseline gates exist, but the required final thresholds must be demonstrated without excluding production code.
- [ ] Verify the complete workflow, artifact publication, protected merge gate, and production image lifecycle in the target hosted GitHub/registry environment.

**Verify locally:** `pnpm build`, `pnpm type-check`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm test:coverage`, `pnpm test:infrastructure`, browser E2E, container audit/smoke scripts, and `git diff --check`.

## Phase 3 — Prove authorization and realtime correctness

**Priority:** P0.

**Repository-local status:** strong boundary and multi-instance coverage exists; the remaining contract/recovery proof must be completed before claiming public multi-user release readiness.

- [x] Add permission-matrix REST and Socket.IO integration coverage for project access, collaborators, sharing, revision conflicts, room joins, editor/viewer behavior, rate limits, reconnects, and session-related paths.
- [x] Authorize project access server-side for REST and room joins; do not trust client-provided role/project/share flags.
- [x] Apply sharing scope, expiration/revocation, and read-only behavior in HTTP and Socket.IO paths.
- [x] Add validated project/socket payload and rate limits with explicit validation, permission, conflict, size, and rate-limit responses.
- [x] Make Redis-enabled Socket.IO integration deterministic with event-driven room hydration and two independent server instances.
- [~] Use a fully runtime-validated, discriminated, acknowledged operation envelope for every durable socket mutation, with bounded future-revision buffering/resync and client-side operation deduplication.
- [~] Recheck authorization immediately before durable socket commit and evict/downgrade affected sockets across instances after collaborator-role changes, unshare, revocation, or deletion.
- [~] Complete minimized DTOs and protocol-limit coverage so inappropriate caller classes cannot receive owner identifiers, collaborator metadata, project data, or share-token-derived information.
- [~] Prove all folder-cycle safeguards and typed infrastructure-failure behavior at REST/socket boundaries.

**Verify:** automated tests must prove no unauthorized read, join, or mutation; delayed authorization and revocation must be tested against a real persistence/Redis path.

## Phase 4 — Make collaboration durable and deterministic

**Priority:** P0 for multi-user production use.

**Repository-local status:** canonical revision/CAS and client write ordering are implemented and tested. Remaining end-to-end recovery and protocol guarantees must be completed before this phase can be marked complete.

- [x] Treat `Project.data` and `Project.revision` as the canonical document and optimistic-concurrency state.
- [x] Persist accepted collaboration-operation/idempotency receipts and use transactional PostgreSQL compare-and-swap updates.
- [x] Prove a concurrent expected-revision race accepts exactly one write, retains the persisted revision/data, deduplicates accepted replay, and cascades collaboration records on deletion using real PostgreSQL.
- [x] Serialize client writes per logical project using `ProjectWriteCoordinator`; coalesce queued snapshots, progress revisions from acknowledgements, and reject obsolete work after hydration resets.
- [x] Acquire cloud credentials only immediately before cloud attempts; retry only bounded transient revision-checked updates; never retry ambiguous project creates, conflicts, authorization failures, or validation failures.
- [x] Pause conflict/permanent-failure lanes, resume only transient failures on reconnect, and make manual Save an explicit resume/retry action.
- [x] Hydrate project ID/title/objects/revision/role/history/save state atomically and prevent stale write completions from corrupting a newly selected project.
- [x] Keep real Redis multi-instance tests and PostgreSQL persistence tests in the disposable infrastructure harness.
- [~] Demonstrate REST-to-socket and socket-to-REST convergence through the same canonical service, including duplicate IDs with altered payloads and strict acknowledgement/broadcast ordering.
- [~] Reconstruct durable collaboration state after process restart/cache miss; prove restart restoration, clear/compaction equivalence, bounded idempotency retention, and offline replay behavior.
- [~] Complete client resync behavior for gaps/lower revisions, bounded offline queue age/bytes, and recovery UX for conflict/reload/duplicate/export choices.
- [~] Complete explicit Redis lifecycle/readiness behavior for disabled single-instance, connecting, ready, and failed states; reject unsafe durable operations when required Redis infrastructure fails.

**Verify:** real-infrastructure tests must demonstrate restart recovery, REST/realtime convergence, deterministic simultaneous edits, replay idempotency, conflict safety, revocation eviction, and Redis startup/runtime readiness—not merely mocked process-local behavior.

## Phase 5 — Improve performance and resilience with budgets

**Priority:** P1.

**Repository-local status:** correctness gates, browser evidence, PWA flows, and privacy-safe observability foundations are in place. Canvas controller extraction, renderer recovery behavior, benchmark baselines, and external Sentry validation remain incomplete.

- [x] Enforce initial JavaScript (300 KB gzip), PWA precache (1 MB), mobile-reference LCP/INP/CLS, and no-uncaught-error 10,000-object scenario gates.
- [x] Keep PDF/canvas rendering chunks out of the initial graph and lazy-load deferred functionality.
- [x] Add a deterministic, versioned 10,000-object fixture and browser benchmark that validates shared-project hydration, worker scene/frame acknowledgement, pan/zoom interaction, frame samples, worker retained/visible/culled/render metrics, and JSON/trace artifacts.
- [x] Repair the document-state invariant exposed by the benchmark: `objectCount` is derived only from document objects and cannot be overwritten by performance reporting.
- [x] Cover PWA offline, update, and recovery behavior in browser tests without caching authenticated API responses by default.
- [x] Implement optional environment-driven, privacy-filtered client/server Sentry integration with shared release IDs and BuildKit-secret source-map upload plumbing.
- [~] Extract pointer drawing and transform orchestration from `DrawingCanvas.tsx` into a tested controller/commit adapter. Existing renderer-worker, keyboard, image-input, collaboration, tool-reset, viewport, and selection adapters are extracted, but the remaining controller boundaries must be completed.
- [~] Harden renderer worker lifecycle into explicit unsupported/starting/ready/recovering/fallback/failed states with bounded queued messages, initialization timeout, retained-scene reload, bounded crash recovery, and a truthful unsupported-browser fallback policy. Current implementation reports unsupported/starting/ready/failed and cleans up worker listeners/resources, but does not yet provide the full recovery/fallback contract.
- [~] Expand the large-board benchmark with warm-up/repeated samples, p95/p99 and dropped-frame statistics, long-task observation, repeated heap trends where available, representative mixed fixtures, and a versioned reference-runner baseline before ratcheting timing/memory limits.
- [~] Add direct, independently tested sanitized operational signals for API 5xx, persistence conflict, socket reconnect exhaustion, Redis adapter failure, and renderer recovery/fallback. Never send canvas/project content, images, share tokens, query strings, request bodies, auth headers, cookies, raw socket payloads, raw user IDs, or PII.
- [ ] Run authorized staging/production Sentry source-map upload, symbolication, privacy, DSN-origin, retention/access, and alert validation using actual provider credentials. Do not claim this from local wiring alone.

**Verify locally:** `pnpm --filter @sketchflow/client test:e2e`, benchmark artifact review, bundle-budget checks, sanitizer tests, and build-asset/image audits.

**Release-owner evidence required:** authorized Sentry staging validation and provider-side alert/retention/access configuration evidence.

## Phase 6 — Finish maintainability work

**Priority:** P1.

- [ ] Establish module-size guidance and ownership/architecture-note requirements for exceptions.
- [~] Continue splitting the largest modules: `DrawingCanvas.tsx` remains large despite extracted adapters; server bootstrap and `ProjectService` still need cohesive boundary extraction.
- [ ] Make `packages/shared` the sole source of truth for socket contracts and project domain types; remove duplicate client/server definitions.
- [ ] Replace unsafe `Record<string, any>` and Socket.IO casts with validated boundary types.
- [ ] Remove production diagnostic console logging in favor of structured, level-controlled telemetry.
- [ ] Finish centralized typed error mapping and remaining ADRs for auth/sharing, collaboration recovery, scaling, and rendering boundaries.

## Phase 7 — Polish product quality and operations

**Priority:** P2.

- [ ] Complete manual accessibility review for keyboard navigation, focus traps, canvas alternatives, ARIA labels, contrast, touch targets, reduced motion, and screen-reader announcements.
- [ ] Publish deploy, migration, rollback, incident, backup/restore, Redis-failure, Clerk-outage, and degraded-realtime runbooks.
- [ ] Run and document backup/restore drills with recovery-time and recovery-point objectives.
- [ ] Configure dashboards and alerts for request latency/errors, database health, sockets/reconnects, collaboration conflicts, and sanitized client errors.
- [ ] Finalize release checklist with migration order, environment validation, rollout health, rollback criteria, and post-deploy smoke tests.

## Recommended completion order

1. Finish the Phase 3–4 collaboration audit findings: one runtime-validated acknowledged operation contract, convergence/restart/revocation proofs, recovery/compaction, and Redis lifecycle readiness.
2. Complete Phase 5 canvas-controller and renderer lifecycle recovery work, then establish benchmark baselines before adding tighter budgets.
3. Raise coverage honestly to the Phase 2 thresholds and verify every hosted CI/container gate.
4. Complete external Phase 1/Sentry/registry/GitHub release-owner checklist items with provider-side evidence.
5. Complete Phase 6–7 maintainability and operational work before calling the overall codebase 9–10/10.

## Scorecard

| Area | Current evidence | Remaining before public-release completion |
| --- | --- | --- |
| Build quality | Local build, types, lint, tests, E2E, and disposable real-infrastructure suite pass | Hosted-CI evidence; final coverage thresholds and artifact verification |
| Security | Hygiene/audit/image safeguards and server authorization foundations are implemented | Credential/provider review, hosted rulesets/scanning, remaining moderate/low dependency review |
| Reliability | PostgreSQL CAS/idempotency, Redis two-instance tests, and client write serialization pass | Restart/convergence/revocation/compaction and Redis runtime-readiness proofs |
| Performance | Bundle/web-vitals/PWA and 10,000-object correctness/gross-stall evidence pass | Controller extraction, worker recovery contract, repeated/reference benchmark baselines |
| Observability | Environment-driven privacy filters and source-map upload plumbing exist | Authorized Sentry provider upload/symbolication/privacy/alert validation |
| Operations | Readiness/container lifecycle and release-hygiene tooling exist | Hosted governance, signing/provenance, runbooks, drills, dashboards, release-owner evidence |
