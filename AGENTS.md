# Copilot Instructions

## Tech Stack & Architecture

- **Framework**: React 19 (Vite) + Node.js (Express) + TypeScript.
- **State Management**: Zustand (`apps/client/src/store/`). Deeply integrated with Socket.IO for real-time state sync.
- **Styling**: Tailwind CSS + Radix UI Primitives. Use `cn()` helper for class merging.
- **Database**: PostgreSQL with Prisma (`apps/server/prisma/schema.prisma`).
- **Real-time**: Socket.IO (`apps/server/src/index.ts` server-side, `apps/client/src/hooks/useSocket.ts` client-side).
- **Authentication**: Clerk (`@clerk/clerk-react` & `@clerk/express`).

## Project Structure

- **Monorepo**: Managed with `pnpm` workspaces.
  - `apps/client`: Frontend application.
  - `apps/server`: Backend server.
  - `packages/shared`: Socket and project TypeScript types.
- **Shared types**: `packages/shared/src/` is socket and project types used by client and server. Geometry and canvas helpers live in the client.
- **Server Entry**: `apps/server/src/index.ts`.
- **Client Entry**: `apps/client/src/main.tsx`.

## Critical Developer Workflows

- **Development**: Run `pnpm dev` to start both frontend (Vite) and backend (tsx watch) concurrently.
- **Database**:
  - `pnpm --filter @sketchflow/server db:migrate` for schema changes.
  - `pnpm --filter @sketchflow/server db:studio` to view data.
- **Testing**: `pnpm test` (Vitest).

## Coding Conventions & Patterns

- **Canvas Rendering**: `DrawingCanvas.tsx` wires input and overlays. Tool math is `apps/client/src/lib/canvas*.ts`. How the layers fit: `docs/canvas.md` (open when changing DrawingCanvas, drawing session, gesture bindings, or `canvas*Gesture` plans).
- **Server**: `apps/server/src/index.ts` wires Express, Redis, and shutdown. HTTP lives in `routes/`, sockets in `realtime/collaborationSocket.ts`, object apply math in `lib/collaborationDocument.ts`. Persistence is `ProjectService` and `FolderService`. Layout: `docs/server.md` (open when changing index, project routes, sockets, or collaboration apply).
- **State Sync**:
  - **Local First**: UI updates immediately via Zustand key `objects`.
  - **Optimistic UI**: Canvas edits update locally, are persisted as idempotent socket operations,
    and remain queued for retry/replay on transient failure. Do not discard local work on an
    acknowledgement failure.
  - **Socket Events**: Defined in `packages/shared/src/types/socket.ts`.
- **Component Pattern**:
  - Use Radix UI primitives for accessible interactive components.
  - Compose complex UI from `apps/client/src/components/ui/` (shadcn/ui style).
- **Environment**: Access env vars via `apps/client/src/config/env.ts` or `apps/server/src/config/env.ts`.
- **Error Handling**:
  - Frontend: `ErrorBoundary.tsx`.
  - Backend: `errorHandlerMiddleware`.

## Testing Guidelines

- **Structure**: Mirror source structure for tests.
- **Mocking**: Use `vi.mock()` for external dependencies (Socket.IO, Clerk).
- **Canvas Tests**: Logic/state plans in `lib/`, not pixel-perfect canvas assertions. See `docs/canvas.md`.

## Common Pitfalls

- **Imports**: Ensure shared code is imported from `@sketchflow/shared` and not relative paths across apps.
- **Socket Connection**: Always check `isConnected` from `useSocket` before emitting events.
