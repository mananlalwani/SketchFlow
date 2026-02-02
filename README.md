# SketchFlow 🎨

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-20232A?logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)

A modern, high-performance real-time collaborative whiteboard application. Built with a focus on speed, reliability, and a premium user experience, **SketchFlow** allows multiple users to draw, sketch, and brainstorm together on a shared infinite canvas with sub-millisecond latency.

Features seamless synchronization across devices, including iPad/tablet support with pressure sensitivity.

## ✨ Features

- **⚡ Real-time Collaboration**: WebSocket-based synchronization ensuring instant updates for all connected users.
- **🖌️ Advanced Drawing Engine**:
  - Pressure-sensitive plotting for tablets/iPads.
  - Smooth rendering with standard and high-DPI support.
  - Tools: Pen, Eraser, Shapes (Line, Rectangle, Ellipse).
  - Customizable stroke sizes and colors.
- **👥 Multi-User Presence**: See other users' cursors and actions in real-time.
- **📱 PWA Support**: Fully installable Progressive Web App with offline capabilities and standalone mode.
- **🚀 High Performance**: 
  - Optimized for 60+ FPS rendering.
  - Efficient update batching and object pooling.
  - Hardware acceleration.
- **🔒 Secure**: Authentication and user management powered by Clerk.

## 🛠 Tech Stack

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

## 🏗️ Architecture Overview

1.  **Monorepo**: Code is split into `client`, `server`, and `shared` packages for better modularity and type safety.
2.  **WebSocket Event Flow**:
    - Clients emit `draw:stroke` or `draw:shape` events.
    - Server validates data (coordinates, types, permissions).
    - Valid updates are broadcast to other clients in the same room.
    - Cursor movements (`cursor:move`) are throttled and broadcast for live presence.
3.  **Persistence**: Project metadata and permissions are stored in PostgreSQL via Prisma. Drawing data can be snapshotted or stored as event logs (depending on implementation specifics).

## 🚀 Getting Started

### Prerequisites

- **Node.js**: v18+
- **pnpm**: v9+
- **PostgreSQL**: (Local or Cloud)

### Environment Setup

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/my-org/sketchflow.git
    cd sketchflow
    ```

2.  **Install dependencies**:
    ```bash
    pnpm install
    ```

3.  **Environment Variables**:
    Create a `.env` file in the root directory:

    ```env
    # Authentication (Clerk)
    VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
    CLERK_SECRET_KEY=sk_test_...

    # Database
    DATABASE_URL="postgresql://user:password@localhost:5432/live_draw?schema=public"

    # Server Config
    PORT=3000
    NODE_ENV=development
    ```

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
pnpm --filter @live-draw/server db:migrate

# Open Prisma Studio (Database GUI)
pnpm --filter @live-draw/server db:studio
```

## 🐳 Docker Support

Run the application using Docker for an isolated environment.

```bash
# Build the image
docker build -t sketchflow .

# Run the container
docker run -p 3000:3000 -e DATABASE_URL=... -e CLERK_SECRET_KEY=... sketchflow
```

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
