# Test roadmap

The former placeholder `todo.test.ts` has been replaced by this executable-work backlog. Each item becomes a test in the named suite before the behavior is changed.

1. Add authenticated REST route tests: owner, collaborator, viewer, anonymous, invalid payload, and stale-revision responses.
2. Add Socket.IO integration tests: handshake authentication, room authorization, editor/viewer permissions, rate limits, expiry, and reconnect.
3. Make browser E2E self-contained by using a test Clerk configuration or a local auth adapter; cover project lifecycle, sharing, autosave recovery, and PWA installation.
4. Add a 10,000-object renderer benchmark that records frame time and visible-object counts in CI as a non-blocking performance report.
5. Add keyboard-only and reduced-motion accessibility checks with Testing Library and Playwright.
6. Continue extracting `DrawingCanvas`, `ProjectManager`, and the renderer worker behind tested module interfaces as each feature is touched.
