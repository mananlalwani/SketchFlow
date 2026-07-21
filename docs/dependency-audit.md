# Dependency audit policy

`pnpm audit --prod --audit-level high` runs on every pull request, main push, and the weekly CI schedule. Critical and high findings fail CI. Lockfile updates are made through pnpm and reviewed with the dependency change.

Audit run: 2026-07-21. Result: no critical or high production findings; 2 low and 10 moderate findings remain. They are not accepted indefinitely: each weekly run must either remove them, document reachability and an owner here, or open remediation work. This review expires 2026-08-21.

Reachability review: DOMPurify is shipped only through `jspdf` and is updated with that direct dependency. Hono is transitive to Prisma's development tooling (`@prisma/dev`); SketchFlow does not import or serve Hono, and it is not part of the application request path. Its pinned override remains in place pending Prisma's next dependency refresh.
