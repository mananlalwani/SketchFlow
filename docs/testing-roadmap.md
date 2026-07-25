# Test roadmap

The repository has unit tests, server REST/Socket.IO integration tests, and Playwright specs. Future
test work is tracked here rather than through skipped placeholder tests.

Existing coverage includes authenticated server boundaries, collaboration receipts, queue storage,
renderer-worker lifecycle/fallback selection, pressure-point retention, PWA recovery/update, large
board, web-vitals, and accessibility specs. Only the Vitest suites run in the current main CI job.

Next validation work:

1. Run Playwright E2E from a self-contained authenticated test environment in CI.
2. Add two-real-browser collaboration tests for same-account cursors, distinct-object merging,
   same-object ordering, reconnect, and queued replay.
3. Run the PostgreSQL/Redis infrastructure suite and container lifecycle checks in hosted CI.
4. Add keyboard-only and reduced-motion assertions beyond the existing axe checks.
5. Record repeatable large-board benchmark baselines before setting timing-based merge gates.
