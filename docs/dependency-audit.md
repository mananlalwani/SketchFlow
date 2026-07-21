# Dependency audit policy

`pnpm audit --prod --audit-level high` runs on every pull request, main push, and the weekly CI schedule. Critical and high findings fail CI. Lockfile updates are made through pnpm and reviewed with the dependency change.

Audit run: 2026-07-21. Result: no critical or high production findings; 2 low and 9 moderate findings remain. The owner for every open item is the platform maintainer. The next review is due 2026-08-21.

| Advisory | Dependency | Reachability | Remediation | Owner / review |
| --- | --- | --- | --- | --- |
| GHSA-q8mj-m7cp-5q26 | `qs` | Transitive through Express; SketchFlow does not enable its vulnerable comma stringify mode. | `qs` ≥ 6.15.2 via Express/Clerk update or override. | Platform / 2026-08-21 |
| GHSA-2j2x-hqr9-3h42 | `react-router` | App uses declarative `BrowserRouter`, which the advisory excludes. | `react-router-dom` ≥ 6.30.4. | Platform / 2026-08-21 |
| GHSA-8988-4f7v-96qf | `@opentelemetry/core` | Inbound HTTP headers remain bounded by Node's header-size limit; telemetry does not receive arbitrary non-HTTP carriers. | Core ≥ 2.8.0 through compatible OpenTelemetry upgrade. | Platform / 2026-08-21 |
| GHSA-xgm2-5f3f-mvvc | `hono` | Prisma development tooling only; no Hono server or AWS adapter is deployed. | Hono ≥ 4.12.27. | Platform / 2026-08-21 |
| GHSA-frvp-7c67-39w9 | `@hono/node-server` | Prisma development tooling only; application does not serve Hono static files. | `@hono/node-server` ≥ 2.0.5. | Platform / 2026-08-21 |
| GHSA-hvrm-45r6-mjfj | `hono` | Prisma development tooling only; SketchFlow does not use Hono SSR. | Hono ≥ 4.12.27. | Platform / 2026-08-21 |
| GHSA-w62v-xxxg-mg59 | `hono` | Prisma development tooling only; SketchFlow does not use Hono JSX SSR. | Hono ≥ 4.12.27. | Platform / 2026-08-21 |

The two low findings (`qs` and `body-parser`) are transitive Express findings. They are reviewed with the same weekly dependency policy and do not bypass the zero critical/high release gate.
