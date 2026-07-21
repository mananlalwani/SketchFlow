# Performance budgets

The production client is measured with a throttling-free desktop browser and a 10,000-object board.

| Metric                    | Budget                                                                    |
| ------------------------- | ------------------------------------------------------------------------- |
| Initial JavaScript (gzip) | 300 KB or less, excluding user-triggered import/export chunks             |
| Initial PWA precache      | 1.6 MB or less                                                            |
| Canvas interaction        | 60 FPS target; never block the main thread for more than 50 ms            |
| Large board               | Pan and zoom a 10,000-object board without rendering off-viewport objects |

## Benchmark procedure

1. Run `pnpm --filter @sketchflow/client build` and inspect Vite's gzip report.
2. Create/load a board containing 10,000 objects.
3. Use browser performance recording while panning and zooming for 10 seconds.
4. Record FPS, long tasks, heap growth, and visible-object count. Regressions require profiling before merge.

The renderer performs viewport culling in `src/workers/rendererWorker.ts`; PDF import and PDF export are intentionally lazy-loaded.
