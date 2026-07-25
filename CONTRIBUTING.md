# Contributing to SketchFlow

## Before opening a pull request

- Use Node.js 20 and the pnpm version pinned in the root `package.json`.
- Install dependencies with `pnpm install --frozen-lockfile`.
- Copy only the app-specific `.env.example` files for local configuration. Never commit `.env` files, generated `dist` output, reports, source maps, coverage, or credentials.
- Keep changes focused and include tests for changed behavior.

## Required local checks

```bash
pnpm format:check
pnpm lint
pnpm type-check
pnpm test
pnpm check:release-hygiene
```

Run the relevant browser or integration suites when touching rendering, persistence, authentication, or collaboration.

## Security and privacy

Do not include production URLs, tokens, user data, canvas content, images, share tokens, authorization headers, or database dumps in issues, commits, fixtures, or test artifacts. Report vulnerabilities using the process in [SECURITY.md](SECURITY.md), not public issues.

## Pull requests

Describe the user-visible change, tests run, migration or rollout impact, and any remaining external validation. Do not mark security, performance, or provider integration work complete without evidence from the actual environment.
