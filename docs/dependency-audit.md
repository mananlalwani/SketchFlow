# Dependency audit policy

`pnpm audit --prod --audit-level high` runs in CI for pull requests and pushes to `main`. High and
critical production findings fail that job. The weekly scheduled workflow currently runs secret
scanning; it does not run the package audit.

Audit snapshot: 2026-07-25 — 0 critical, 0 high, 13 moderate, and 2 low production findings across
651 dependencies. This snapshot is informational, not a reachability assessment or a permanent
exception list. Re-run the command before a release and review its actual advisory output rather than
relying on copied advisory IDs or dates.

Lockfile changes are made through pnpm and reviewed with their dependency change. Moderate and low
findings are triaged by the maintainer; any remediation or accepted risk must reference the exact
current advisory and affected dependency version.
