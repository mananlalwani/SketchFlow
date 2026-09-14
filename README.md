# SketchFlow

A collaborative whiteboard: React, TypeScript, Socket.IO, PostgreSQL, Prisma, and Clerk. MIT licensed.

Collaboration is covered by unit and server integration tests. Browser benchmarks and provider-side monitoring are release-owner work; see [`docs/performance.md`](docs/performance.md) and the release checklist before making deployment claims.

## Features

- **Collaboration**: Socket.IO object operations; each browser session has its own cursor, including two devices on the same account. Distinct-object edits merge; simultaneous edits to the same object use server-order last-writer-wins.
- **Drawing**: Pen, highlighter, eraser, line/rectangle/ellipse/star/triangle, text, select/transform. Stroke size, color, and per-point pressure survive save/load and export. Standard and high-DPI canvases.
- **PWA**: Installable shell with IndexedDB replay of unsent operations.
- **Rendering**: OffscreenCanvas worker with a main-thread fallback. How the client is split: [`docs/canvas.md`](docs/canvas.md). Large-board fixtures and limits: [`docs/performance.md`](docs/performance.md).

## Tech Stack

This project is a monorepo managed with `pnpm` workspaces.

### **Apps**

#### **Client** (`apps/client`)

- **Framework**: [React 19](https://react.dev/) + [Vite](https://vitejs.dev/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) + [Radix UI](https://www.radix-ui.com/)
- **State Management**: [Zustand](https://github.com/pmndrs/zustand)
- **Real-time**: [Socket.IO Client](https://socket.io/)
- **PWA**: [Vite PWA](https://vite-pwa-org.netlify.app/)

#### **Server** (`apps/server`)

- **Runtime**: [Node.js](https://nodejs.org/)
- **Framework**: [Express](https://expressjs.com/)
- **Real-time**: [Socket.IO](https://socket.io/)
- **Database**: [PostgreSQL](https://www.postgresql.org/) + [Prisma](https://www.prisma.io/)
- **Observability**: [OpenTelemetry](https://opentelemetry.io/)
- **Auth**: [Clerk SDK](https://clerk.com/)

### **Packages**

- **Shared** (`packages/shared`): Socket and project TypeScript types used by client and server. Canvas geometry and gesture plans live in `apps/client`.

## Architecture Overview

1.  **Monorepo**: `apps/client`, `apps/server`, and `packages/shared`.
2.  **WebSocket Event Flow**:
    - Clients persist an idempotent object operation locally, then emit a `collaboration:commit` envelope.
    - The server authorizes the room and editor, applies the operation transactionally, and broadcasts canonical state.
    - Different object IDs merge; simultaneous updates to the same ID use server-order last-writer-wins.
    - Cursor movements are keyed by browser session, so two devices under one account remain visible.
3.  **Persistence**: PostgreSQL/Prisma stores project metadata, permissions, canonical project JSON, revisions, and collaboration-operation receipts. IndexedDB retains unsent client operations for replay. Server split: [`docs/server.md`](docs/server.md).

## Getting Started

### Prerequisites

- **Node.js**: 24.x (the version used by CI)
- **pnpm**: the exact version pinned by the root `packageManager` field; Corepack is recommended.
- **PostgreSQL**: 16+ for local development and integration testing.
- **Redis**: required for multi-instance Socket.IO deployments; optional only for explicit single-instance development.

### Environment Setup

1.  **Clone the repository**:

    ```bash
    git clone <your-public-repository-url>
    cd sketchflow
    ```

2.  **Install dependencies**:

    ```bash
    pnpm install
    ```

3.  **Environment Variables**:
    Copy each app's template to a local, ignored file and populate it with development credentials:

    ```bash
    cp apps/client/.env.example apps/client/.env
    cp apps/server/.env.example apps/server/.env
    ```

    The browser may contain only intentionally public configuration such as the Clerk publishable key, release ID, and a provider-approved Sentry DSN. Keep database URLs, Clerk secret keys, telemetry credentials, source-map upload tokens, and authorization headers server-side or in deployment secret storage. Do not commit either `.env` file.

### Development

Start both client and server in development mode:

```bash
pnpm dev
```

- **Frontend**: `http://localhost:5173`
- **Backend**: `http://localhost:3000`

### Database Management

Run Prisma migrations to set up your database schema:

```bash
# Apply migrations
pnpm --filter @sketchflow/server db:migrate

# Open Prisma Studio (Database GUI)
pnpm --filter @sketchflow/server db:studio
```

### Production release

Push a reviewed `v*` tag to validate the source, publish a versioned GHCR image, and create a
GitHub Release. Client changes publish through Cloudflare Pages, while server image changes publish to
GHCR and are picked up by the VPS deployment timer. The running service requires Clerk live credentials
and explicit `CORS_ORIGINS`; Sentry, OpenTelemetry, release ID, and Redis (unless scaled beyond one
Socket.IO instance) are optional production enhancements. Auto-shape detection is intentionally opt-in.

## Docker Support

Run the API and server-rendered DrawAPI page using Docker for an isolated environment. The production
client is served separately by Cloudflare Pages.

```bash
# Build the image
docker build -t sketchflow .

# Run the container
docker run -p 3000:3000 -e DATABASE_URL=... -e CLERK_SECRET_KEY=... sketchflow
```
