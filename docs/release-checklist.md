# Public release checklist

This repository is intended to be published from a clean export, not by copying historical Git metadata. A clean export does not replace credential rotation or external security controls.

## Repository-local evidence

- [ ] Create a clean export/clone with no inherited ignored files.
- [ ] Run `pnpm install --frozen-lockfile`.
- [ ] Run `pnpm check:release-hygiene`; no env files (except examples), generated distributions, source maps, reports, coverage, or TypeScript build metadata may be tracked.
- [ ] Run the secret scanner on the export and, where authorized, all reachable history without printing findings.
- [ ] Build the production image and inspect its filesystem/assets for `.env` files, source maps, `sourceMappingURL`, private telemetry credentials, database URLs, and server-only keys.
- [ ] Run format, lint, type checks, unit/boundary tests, real PostgreSQL/Redis integration tests, browser/accessibility tests, coverage, migration checks, and the production-image lifecycle test. `pnpm test:infrastructure` starts disposable PostgreSQL and Redis services, applies all migrations, runs the real persistence suite and the two-instance Socket.IO suite, then removes the services and data.
- [ ] Verify the release revision has reproducible package metadata and a reviewed dependency audit.
- [ ] Update `CHANGELOG.md`, README version requirements, and migration notes with measured evidence only.

## Release-owner actions

- [ ] Rotate/revoke or positively verify every credential that may have appeared in source, history, CI, artifacts, caches, or image layers.
- [ ] Enable GitHub secret scanning, push protection, private vulnerability reporting, branch/ruleset protections, required checks, artifact retention, and package visibility controls.
- [ ] Configure a monitored security and conduct contact.
- [ ] Review registry repositories, CI logs/caches/artifacts, remote refs/tags, provider access logs, and deployment secrets.
- [ ] Configure telemetry providers with least privilege. Browser code may use only public/provider-approved ingest identifiers; source-map upload credentials remain build-only secrets.
- [ ] Perform an authorized staging test for Sentry source-map symbolication, event privacy, alerts, and release-ID consistency if Sentry is enabled.
- [ ] Approve license, third-party notices, release signing/SBOM/provenance policy, and publication visibility.

## Publication

- [ ] Create a new public repository from the audited clean export.
- [ ] Run required hosted CI on that repository and preserve evidence of a successful run.
- [ ] Publish only after all required checks and external controls are complete.
- [ ] Tag the release, publish the changelog, and retain the release verification record.
