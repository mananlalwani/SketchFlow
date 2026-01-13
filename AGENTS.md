# Copilot Instructions

## Tech Stack & Architecture
- **Framework**: React 18 (Vite) + Node.js (Express) + TypeScript.
- **State Management**: Zustand (`src/store/`). Deeply integrated with Socket.IO for real-time state sync.
- **Styling**: Tailwind CSS + Radix UI Primitives. Use `cn()` helper for class merging.
- **Database**: PostgreSQL with Prisma (`prisma/schema.prisma`).
- **Real-time**: Socket.IO (`src/server/index.ts` server-side, `src/hooks/useSocket.ts` client-side).
- **Authentication**: Clerk (`@clerk/clerk-react` & `@clerk/express`).

## Project Structure
- **Monorepo-style**: Client (`src/`) and Server (`src/server/`) coexist in one repo but have separate builds/configs.
- **Shared Utils**: `src/lib/` contains shared logic often used by both client and server (e.g., geometry, validation).
- **Server Entry**: `src/server/index.ts` (dev via `tsx`, prod via `node dist/server.js`).
- **Client Entry**: `src/main.tsx`.

## Critical Developer Workflows
- **Development**: Run `npm run dev` to start both frontend (Vite) and backend (tsx watch) concurrently.
- **Database**:
  - `npm run db:migrate` (prisma migrate dev) for schema changes.
  - `npm run db:studio` to view data.
- **Testing**: `npm test` (Vitest).
  - Tests located in `src/__tests__/`.
  - Browser APIs (`ResizeObserver`, `matchMedia`) are mocked in `src/test/setup.ts`.

## Coding Conventions & Patterns
- **Canvas Rendering**: `DrawingCanvas.tsx` handles raw canvas ops, but logic lies in `src/lib/` (e.g., `strokeProcessor.ts`).
- **State Sync**:
  - **Local First**: UI updates immediately via Zustand key `objects`.
  - **Optimistic UI**: Changes pushed to socket, rolled back on error.
  - **Socket Events**: Defined in `src/types/socket.ts`.
- **Component Pattern**:
  - Use Radix UI primitives for accessible interactive components.
  - Compose complex UI from `src/components/ui/` (shadcn/ui style).
- **Environment**: Access env vars via `src/config/env.ts` (client) or `src/server/config/env.js` (server) for type safety.
- **Error Handling**:
  - Frontend: `ErrorBoundary.tsx` + `useErrorHandler` hook.
  - Backend: `errorHandlerMiddleware`.

## Testing Guidelines
- **Structure**: Mirror `src/` structure inside `src/__tests__/`.
- **Mocking**: Use `vi.mock()` for external dependencies (Socket.IO, Clerk).
- **Canvas Tests**: Focus on logic/state transformations rather than pixel-perfect canvas assertions.

## Common Pitfalls
- **Imports**: Avoid importing server-only code (e.g. `src/server/*`) into client components.
- **Socket Connection**: Always check `isConnected` from `useSocket` before emitting events.
- **Prisma**: Remember to use `disconnectPrisma()` in scripts/server shutdown.
