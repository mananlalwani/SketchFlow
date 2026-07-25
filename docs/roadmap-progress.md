# Roadmap progress

This document records what has been added toward the production-readiness roadmap and what remains open. It intentionally does **not** claim that all phases are complete.

## Completed or improved in this pass

- CI now has a PostgreSQL-backed release-gate job that installs dependencies, generates Prisma client code, applies migrations to a clean database, builds the workspace, runs existing lint/type/test/audit checks, and runs Playwright E2E tests.
- The Docker smoke test now waits on `/api/readyz` and runs against the CI PostgreSQL service instead of checking liveness only.
- Root scripts expose the release-gate commands from one place, including E2E and coverage entry points for follow-up hardening.
- Client and server socket compatibility modules re-export the shared package contract so new imports can converge on `@sketchflow/shared`.
- The deployment runbook now covers release checks, rollback, incidents, backup/restore drills, Redis degradation, Clerk outage handling, dashboards, and alerts.

## Still not complete

- GitHub branch protection must be configured in repository settings; code cannot enforce it by itself.
- Server ESLint and full-repo formatting still need real tool configuration and cleanup of existing formatting debt.
- Accessibility checks need actual axe-backed Playwright tests for the draw surface, toolbar, dialogs, project manager, and share flow.
- Coverage thresholds are not ratcheted yet.
- Authorization and Socket.IO matrix coverage still needs expanded tests proving every role and share-link state.
- Collaboration durability still needs restart, reconnect, two-editor, delayed-message, offline replay, and multi-instance tests.
- Performance budgets and a reproducible 10,000-object benchmark still need implementation.
- Large modules still need incremental extraction behind tested interfaces.
- Operational dashboards and quarterly backup/restore drills require production infrastructure work outside this repository.
