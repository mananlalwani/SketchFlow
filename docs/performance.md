# Performance budgets

The production client is measured with a throttling-free desktop browser and a 10,000-object board.

| Metric                    | Budget                                                                    |
| ------------------------- | ------------------------------------------------------------------------- |
| Initial JavaScript (gzip) | 300 KB or less, excluding user-triggered import/export chunks             |
| Initial PWA precache      | 1 MB or less, excluding deferred canvas and PDF tooling                   |
| LCP                       | 2.5 s or less on the Playwright mobile reference profile                  |
| INP                       | 200 ms or less on the Playwright mobile reference profile                 |
| CLS                       | 0.1 or less on the Playwright mobile reference profile                    |
| Canvas interaction        | 60 FPS target; never block the main thread for more than 50 ms            |
| Large board               | Pan and zoom a 10,000-object board without rendering off-viewport objects |

## Benchmark procedure

1. Run `pnpm check:client-budgets`. It builds the client, verifies the static initial JavaScript
   graph is no more than 300 KB gzip, confirms PDF/canvas rendering chunks remain deferred, and
   checks the complete service-worker precache remains below 1 MB.
2. Run `pnpm --filter @sketchflow/client test:e2e -- src/__tests__/e2e/large-board.spec.ts`.
   The scenario uses fixture version 1 (`rect-grid-v1-100x100-spacing-320`): a stable 100×100
   rectangle grid at 320-pixel spacing, loaded through the shared-project path.
3. The benchmark waits for the worker to acknowledge the retained 10,000-object scene, then executes
   a space-drag pan and Ctrl+wheel zoom while collecting animation-frame intervals.
4. Inspect the `large-board-benchmark.json` attachment and Playwright trace. It records fixture/schema
   identity, board-ready time, end-to-end interaction time, interaction-time frame mean/max, heap data
   where Chromium exposes it, uncaught errors, and worker scene/frame telemetry (ingestion, retained,
   visible, culled, and render duration).

The unit suite uses the same scale for deterministic culling correctness. Browser timings, heap, and
throughput are comparison artifacts rather than per-run CI budgets until a stable runner baseline is
established. CI gates fixture/worker readiness, no uncaught errors, and gross interaction stalls; a
renderer change requires comparing two benchmark artifacts and a trace before merge.

`web-vitals.spec.ts` runs Chromium with a 393×851 touch viewport, device scale factor 2.75, and
4× CPU throttling. It captures `web-vitals-mobile.json` and fails when LCP, INP, or CLS exceed the
table budgets. The Playwright HTML report retains both JSON attachments in CI.

The editor canvas is route-lazy-loaded, and PDF import/export is intentionally lazy-loaded and excluded from the initial PWA precache. The renderer performs viewport culling in `src/workers/rendererWorker.ts`.

The production Playwright suite verifies a changed service-worker activation, offline app-shell
recovery, and that an authenticated API response never enters Cache Storage.

## Production telemetry

Set `VITE_RELEASE_ID` and `RELEASE_ID` to the deployed git SHA or release number. Client and
server OpenTelemetry resources then attach the same release identifier to errors, HTTP requests,
socket activity, and persistence conflicts. Source maps must be uploaded only to the private
monitoring provider during deployment; public production bundles keep source maps disabled.
