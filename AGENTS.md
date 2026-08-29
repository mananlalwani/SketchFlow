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
  - `packages/shared`: Shared types and utilities.
- **Shared Utils**: `packages/shared/src/` contains shared logic often used by both client and server (e.g., geometry, validation, socket types).
- **Server Entry**: `apps/server/src/index.ts`.
- **Client Entry**: `apps/client/src/main.tsx`.

## Critical Developer Workflows

- **Development**: Run `pnpm dev` to start both frontend (Vite) and backend (tsx watch) concurrently.
- **Database**:
  - `pnpm --filter @sketchflow/server db:migrate` for schema changes.
  - `pnpm --filter @sketchflow/server db:studio` to view data.
- **Testing**: `pnpm test` (Vitest).

## Coding Conventions & Patterns

- **Canvas Rendering**: `DrawingCanvas.tsx` handles raw canvas ops, but logic lies in hooks and utils.
- **State Sync**:
  - **Local First**: UI updates immediately via Zustand key `objects`.
  - **Optimistic UI**: Canvas edits update locally, are persisted as idempotent socket operations,
    and remain queued for retry/replay on transient failure. Do not discard local work on an
    acknowledgement failure.
  - **Socket Events**: Defined in `packages/shared/src/types/socket.ts`.
- **Component Pattern**:
  - Use Radix UI primitives for accessible interactive components.
  - Compose complex UI from `apps/client/src/components/ui/` (shadcn/ui style).
- **Environment**: Access env vars via `src/config/env.ts` (client) or `src/config/env.js` (server) for type safety.
- **Error Handling**:
  - Frontend: `ErrorBoundary.tsx` + `useErrorHandler` hook.
  - Backend: `errorHandlerMiddleware`.

## Testing Guidelines

- **Structure**: Mirror source structure for tests.
- **Mocking**: Use `vi.mock()` for external dependencies (Socket.IO, Clerk).
- **Canvas Tests**: Focus on logic/state transformations rather than pixel-perfect canvas assertions.

## Common Pitfalls

- **Imports**: Ensure shared code is imported from `@sketchflow/shared` and not relative paths across apps.
- **Socket Connection**: Always check `isConnected` from `useSocket` before emitting events.
