# Dependency audit policy

`pnpm audit --prod --audit-level high` is a release-owner check and is not currently run by GitHub
Actions. Run it locally before a release and review the actual advisory output. The weekly scheduled
workflow runs secret scanning; it does not run the package audit.

Audit snapshot: 2026-07-25 — 0 critical, 0 high, 13 moderate, and 2 low production findings across
651 dependencies. This snapshot is informational, not a reachability assessment or a permanent
exception list. Re-run the command before a release and review its actual advisory output rather than
relying on copied advisory IDs or dates.

Lockfile changes are made through pnpm and reviewed with their dependency change. Moderate and low
findings are triaged by the maintainer; any remediation or accepted risk must reference the exact
current advisory and affected dependency version.
