# Dependency audit policy

`pnpm audit --prod --audit-level high` is a release-owner check and is not currently run by GitHub
Actions. Run it locally before a release and review the actual advisory output. The weekly scheduled
workflow runs secret scanning; it does not run the package audit.

Audit snapshot: 2026-08-30 — no known production vulnerabilities. This snapshot is informational,
not a permanent guarantee; re-run the command before a release and review its actual advisory output.

Lockfile changes are made through pnpm and reviewed with their dependency change. Moderate and low
findings are triaged by the maintainer; any remediation or accepted risk must reference the exact
current advisory and affected dependency version.
