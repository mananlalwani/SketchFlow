# SketchFlow

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-20232A?logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)

A real-time collaborative whiteboard application built with React, TypeScript, Socket.IO, PostgreSQL, and Prisma. SketchFlow supports drawing, shapes, presence, project sharing, and an installable web experience.

Performance and collaboration guarantees are validated by the repository's benchmark and integration gates; see [`docs/performance.md`](docs/performance.md) and the release checklist before making deployment claims.

## Features

- **Real-time Collaboration**: Socket.IO object operations synchronize instantly; each browser session has its own live cursor, including two devices signed into the same account. Distinct-object edits merge; simultaneous edits to the same object use server-order last-writer-wins.
- **Advanced Drawing Engine**:
  - Pressure-sensitive plotting preserved per stroke point through save/load and export.
  - Smooth rendering with standard and high-DPI support.
  - Tools: Pen, Eraser, Shapes (Line, Rectangle, Ellipse).
  - Customizable stroke sizes and colors.
- **Multi-User Presence**: See other users' cursors and actions in real-time.
- **PWA Support**: Installable Progressive Web App with offline shell recovery and a durable IndexedDB operation queue.
- **Performance tooling**:
  - Worker-backed OffscreenCanvas rendering with a main-thread fallback when transferable OffscreenCanvas is unavailable.
  - Deterministic large-board benchmark fixtures and performance artifacts.
  - Performance limits documented with the benchmark.
- **Secure**: Authentication and user management powered by Clerk.

## Tech Stack

This project is a monorepo managed with `pnpm` workspaces.

### **Apps**

#### **Client** (`apps/client`)

- **Framework**: [React 18](https://react.dev/) + [Vite](https://vitejs.dev/)
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

- **Shared** (`packages/shared`): Common TypeScript types, utility functions, and constants shared between client and server.

## Architecture Overview

1.  **Monorepo**: Code is split into `client`, `server`, and `shared` packages for better modularity and type safety.
2.  **WebSocket Event Flow**:
    - Clients emit `draw:stroke` or `draw:shape` events.
    - Server validates data (coordinates, types, permissions).
    - Valid updates are broadcast to other clients in the same room.
    - Cursor movements (`cursor:move`) are throttled and broadcast for live presence.
3.  **Persistence**: Project metadata and permissions are stored in PostgreSQL via Prisma. Drawing data can be snapshotted or stored as event logs (depending on implementation specifics).

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

Push a signed-off `v*` tag to publish the versioned GHCR image and GitHub Release. The protected
`production` GitHub Environment must provide `DEPLOY_WEBHOOK_URL` and `DEPLOY_WEBHOOK_TOKEN`, plus
`PRODUCTION_APP_URL` and `PRODUCTION_API_URL` variables. The running service must set `RELEASE_ID`,
`SENTRY_DSN`, `OTEL_EXPORTER_OTLP_ENDPOINT`, Clerk live credentials, explicit `CORS_ORIGINS`, and
`REDIS_URL` when scaled beyond one Socket.IO instance. Auto-shape detection is intentionally opt-in.

## Docker Support

Run the application using Docker for an isolated environment.

```bash
# Build the image
docker build -t sketchflow .

# Run the container
docker run -p 3000:3000 -e DATABASE_URL=... -e CLERK_SECRET_KEY=... sketchflow
```
