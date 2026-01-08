# Agent Context: Live Draw Collaborative Drawing Application

> **Purpose:** This file provides instant understanding of the codebase for AI agents and new developers.

## Quick Overview

**Live Draw** is a real-time collaborative drawing application with Canvas API rendering, WebSocket sync, and dual-mode operation (authenticated users + guests).

**Tech Stack:**
- **Frontend:** React 18 + TypeScript + Vite
- **Backend:** Node.js + Express + Socket.IO
- **Database:** PostgreSQL + Prisma ORM
- **Auth:** Clerk (OAuth, email/password)
- **Storage:** IndexedDB (guests) + PostgreSQL (authenticated)
- **Styling:** Tailwind CSS + Radix UI components
- **State:** Zustand (global state)
- **Testing:** Vitest + Testing Library

**Key Features:**
- Real-time collaborative drawing with live cursors
- Guest mode (anonymous, local storage) + authenticated mode (cloud sync)
- Shape detection (hand-drawn shapes → perfect shapes)
- Export to PNG/PDF/SVG/DRAW
- Project management with folders and sharing
- Undo/redo with history
- Mobile/touch support with pressure sensitivity

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND (React)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ DrawingCanvas│  │ Toolbar      │  │ ProjectMgr   │     │
│  │ (Canvas API) │  │ (Tools)      │  │ (CRUD)       │     │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘     │
│         │                  │                  │              │
│         └──────────────────┴──────────────────┘              │
│                            │                                 │
│                   ┌────────▼─────────┐                      │
│                   │ Drawing Store    │ (Zustand)            │
│                   │ - objects[]      │                      │
│                   │ - history        │                      │
│                   │ - currentTool    │                      │
│                   └────────┬─────────┘                      │
│                            │                                 │
│         ┌──────────────────┼──────────────────┐             │
│         │                  │                  │             │
│   ┌─────▼──────┐   ┌──────▼──────┐   ┌──────▼──────┐      │
│   │ Auth Store │   │  useSocket  │   │  API Layer  │      │
│   │ (Clerk)    │   │ (Socket.IO) │   │  (fetch)    │      │
│   └─────┬──────┘   └──────┬──────┘   └──────┬──────┘      │
└─────────┼──────────────────┼──────────────────┼─────────────┘
          │                  │                  │
          │                  │                  │
┌─────────▼──────────────────▼──────────────────▼─────────────┐
│                        BACKEND (Node.js)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ REST API     │  │ WebSocket    │  │ Auth Webhook │     │
│  │ /api/...     │  │ (Socket.IO)  │  │ (Clerk)      │     │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘     │
│         │                  │                  │              │
│         └──────────────────┴──────────────────┘              │
│                            │                                 │
│                   ┌────────▼─────────┐                      │
│                   │ Services         │                      │
│                   │ - ProjectService │                      │
│                   │ - UserService    │                      │
│                   │ - DrawingService │                      │
│                   └────────┬─────────┘                      │
│                            │                                 │
│                   ┌────────▼─────────┐                      │
│                   │ Prisma ORM       │                      │
│                   └────────┬─────────┘                      │
└─────────────────────────────┼─────────────────────────────┘
                              │
                     ┌────────▼─────────┐
                     │ PostgreSQL       │
                     │ - users          │
                     │ - projects       │
                     │ - collaborators  │
                     │ - folders        │
                     └──────────────────┘
```

---

## Directory Structure

```
/home/manan/Documents/dev/live_test/
├── src/
│   ├── components/          # React components
│   │   ├── layout/         # Layout components (TopBar, BottomBar, Sidebar)
│   │   ├── ui/             # Radix UI primitives (Button, Dialog, etc.)
│   │   ├── DrawingCanvas.tsx    # Main canvas rendering (CRITICAL)
│   │   ├── DrawingToolbar.tsx   # Tool selection
│   │   ├── ProjectManager.tsx   # Project CRUD UI (CRITICAL)
│   │   ├── Navbar.tsx          # Top navigation
│   │   └── ...
│   ├── store/              # Zustand state management
│   │   ├── drawingStore.ts     # Canvas state (objects, tools, history)
│   │   └── authStore.ts        # Auth state (user, guest mode)
│   ├── hooks/              # Custom React hooks
│   │   ├── useSocket.ts        # Socket.IO connection
│   │   ├── useLiveCursors.ts   # Real-time cursor positions
│   │   └── useProjectPermissions.ts
│   ├── lib/                # Utility libraries
│   │   ├── api.ts             # API client (fetch wrapper)
│   │   ├── localProjects.ts   # IndexedDB for guests (CRITICAL)
│   │   ├── export.ts          # PNG/PDF/SVG export
│   │   ├── drawFormat.ts      # .draw file format
│   │   ├── geometry.ts        # Math utilities
│   │   └── shapeDetectors/    # Shape recognition algorithms
│   ├── server/             # Backend code
│   │   ├── index.ts           # Express + Socket.IO server
│   │   ├── services/          # Business logic
│   │   │   ├── ProjectService.ts
│   │   │   ├── UserService.ts
│   │   │   ├── DrawingService.ts
│   │   │   └── AuthService.ts
│   │   └── middleware/        # Auth middleware
│   ├── types/              # TypeScript types
│   │   └── socket.ts          # Socket event types
│   └── workers/            # Web Workers
│       └── rendererWorker.ts  # Offscreen canvas rendering
├── prisma/
│   ├── schema.prisma          # Database schema
│   └── migrations/
└── dist/                   # Build output
```

---

## Key Patterns & Conventions

### 1. Dual-Mode Operation (Guest vs Authenticated)

**Guest Mode:**
- No authentication required
- Projects stored in IndexedDB (via `localProjectsService`)
- No real-time collaboration (Socket.IO disabled)
- Guest ID stored in `localStorage` as UUID
- Full drawing permissions on local projects

**Authenticated Mode:**
- Clerk authentication (OAuth or email/password)
- Projects stored in PostgreSQL (via REST API)
- Real-time collaboration enabled
- Role-based permissions (owner/editor/viewer)

**Detection Logic:**
```typescript
// In authStore.ts
const isGuest = !userId && !!guestId;
const isAuthenticated = isSignedIn && !!userId;

// Used throughout the app:
if (isGuest) {
  // Use localProjectsService
  await localProjectsService.create(title, data);
} else {
  // Use API
  const token = await getToken();
  await createProject(title, data, token);
}
```

**Key Files:**
- `src/store/authStore.ts` - Guest ID generation and auth state
- `src/lib/localProjects.ts` - IndexedDB operations for guests
- `src/lib/api.ts` - API client with guest fallback

### 2. Canvas Rendering Architecture

**Coordinate Systems:**
- **World Space:** Infinite canvas (0 to WORLD_WIDTH/HEIGHT)
- **Screen Space:** Visible viewport with pan/zoom

**Rendering Pipeline:**
```
User Input → Store Update → Redraw Request → Canvas Render
                                              ↓
                          Main Thread ←── Web Worker (future)
```

**Key Components:**
- `DrawingCanvas.tsx` - Main canvas component, event handlers
- `drawingStore.ts` - Objects array, current tool, history
- `workers/rendererWorker.ts` - Offscreen rendering (not fully used yet)

**Object Structure:**
```typescript
type DrawingObject = {
  id: string;
  type: 'path' | 'line' | 'rectangle' | 'ellipse' | 'text' | 'image' | 'sticky';
  x?: number;  // Position (for shapes/text/images)
  y?: number;
  points?: Point[];  // For paths
  color?: string;
  size?: number;  // Stroke width
  fill?: string;
  // ... type-specific properties
};
```

### 3. State Management (Zustand)

**Drawing Store** (`drawingStore.ts`):
```typescript
interface DrawingStore {
  // Core state
  objects: DrawingObject[];
  currentTool: Tool;
  currentProject: string | null;
  
  // History
  history: DrawingObject[][];
  historyIndex: number;
  
  // Project info
  projectTitle: string;
  projectRole: 'owner' | 'editor' | 'viewer';
  
  // Flags
  unsavedChanges: boolean;
  isFullRedrawRequested: boolean;
  
  // Actions
  setObjects: (objects: DrawingObject[]) => void;
  addObject: (object: DrawingObject) => void;
  updateObject: (id: string, updates: Partial<DrawingObject>) => void;
  deleteObject: (id: string) => void;
  undo: () => void;
  redo: () => void;
  // ...
}
```

**Auth Store** (`authStore.ts`):
```typescript
interface AuthStore {
  userId: string | null;
  guestId: string | null;
  isGuest: boolean;
  isAuthenticated: boolean;
  
  // Computed properties
  effectiveUserId: string;  // userId or guestId
  
  // Actions
  setUserId: (id: string | null) => void;
  clearGuestId: () => void;
}
```

### 4. API Layer & Error Handling

**Token-Based Guest Detection:**
```typescript
// In api.ts
export async function listProjects(token?: string | null): Promise<ProjectListItem[]> {
  if (!token) {
    // No token = guest mode
    return localProjectsService.list();
  }
  // Has token = authenticated
  return httpWithRetry<ProjectListItem[]>('/api/projects', undefined, token);
}
```

**Retry Logic:**
```typescript
async function httpWithRetry<T>(
  url: string,
  options?: RequestInit,
  token?: string | null,
  retries = 3
): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
          ...options?.headers,
        },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      if (i === retries - 1) throw error;
      await delay(Math.pow(2, i) * 1000); // Exponential backoff
    }
  }
  throw new Error('Max retries exceeded');
}
```

### 5. Real-Time Collaboration (Socket.IO)

**Disabled for Guests:**
```typescript
// In useSocket.ts
useEffect(() => {
  if (isGuest) {
    setIsConnected(false);
    return; // Don't connect socket for guests
  }
  
  // Connect socket for authenticated users
  socketManager.connect(token);
}, [isGuest, token]);
```

**Event Types:**
```typescript
// src/types/socket.ts
interface ClientToServerEvents {
  'project:join': (projectId: string) => void;
  'drawing:update': (data: DrawingUpdateData) => void;
  'cursor:move': (data: CursorPosition) => void;
}

interface ServerToClientEvents {
  'drawing:update': (data: DrawingUpdateData) => void;
  'cursor:move': (data: CursorPosition) => void;
  'user:joined': (data: UserInfo) => void;
  'user:left': (userId: string) => void;
}
```

**Room Management:**
```typescript
// Server joins users to project-specific rooms
socket.on('project:join', (projectId) => {
  socket.join(`project:${projectId}`);
  socket.to(`project:${projectId}`).emit('user:joined', userInfo);
});
```

### 6. Project Persistence

**Autosave System:**
```typescript
// AutoSaveHandler.tsx
useEffect(() => {
  if (!unsavedChanges) return;
  
  const timer = setTimeout(async () => {
    try {
      if (currentProject) {
        // Update existing project
        await updateProject(currentProject, projectTitle, serializedData, token);
      } else {
        // Create new project
        const id = await createProject(projectTitle, serializedData, token);
        setCurrentProject(id);
      }
      markSaved();
    } catch (error) {
      console.error('Autosave failed:', error);
      // TODO: Implement retry and user notification
    }
  }, 2000); // 2 second debounce
  
  return () => clearTimeout(timer);
}, [unsavedChanges, objects, projectTitle]);
```

**Serialization:**
```typescript
// drawFormat.ts
export function serializeProject(objects: DrawingObject[]): string {
  return JSON.stringify(objects);
}

export function deserializeProject(data: string): DrawingObject[] {
  try {
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
```

### 7. Shape Detection

**Hand-Drawn to Perfect Shapes:**
```typescript
// lib/shapeDetectors/
// When user completes a stroke:
const detectedShape = detectShape(points);

if (detectedShape.type === 'line') {
  // Replace path with perfect line
  return { type: 'line', ...detectedShape };
} else if (detectedShape.type === 'rectangle') {
  // Replace path with rectangle
  return { type: 'rectangle', ...detectedShape };
}
```

**Detection Thresholds:**
- Line: < 10° angle deviation
- Rectangle: 4 corners with ~90° angles
- Circle: Aspect ratio ~1.0, low roughness
- Triangle: 3 distinct corners

### 8. Export System

**PNG Export:**
```typescript
// export.ts
export async function exportToPNG(
  canvas: HTMLCanvasElement,
  filename: string
): Promise<void> {
  canvas.toBlob((blob) => {
    if (!blob) return;
    downloadBlob(blob, filename);
  }, 'image/png');
}
```

**PDF Export:**
```typescript
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

export async function exportToPDF(
  element: HTMLElement,
  filename: string
): Promise<void> {
  const canvas = await html2canvas(element);
  const imgData = canvas.toDataURL('image/png');
  
  const pdf = new jsPDF({
    orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
    unit: 'px',
    format: [canvas.width, canvas.height],
  });
  
  pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
  pdf.save(filename);
}
```

**SVG Export:**
```typescript
export function exportToSVG(objects: DrawingObject[]): string {
  const svgElements = objects.map(obj => {
    switch (obj.type) {
      case 'path':
        return `<path d="${pointsToSVGPath(obj.points)}" ... />`;
      case 'rectangle':
        return `<rect x="${obj.x}" y="${obj.y}" ... />`;
      // ... other shapes
    }
  });
  
  return `<svg xmlns="http://www.w3.org/2000/svg" ...>${svgElements.join('')}</svg>`;
}
```

---

## Critical Files Deep Dive

### `src/components/DrawingCanvas.tsx` (1000+ lines)

**Responsibilities:**
- Render all drawing objects to canvas
- Handle mouse/touch input (draw, pan, zoom, select)
- Manage drawing state (current stroke, selection)
- Emit real-time updates via Socket.IO
- Keyboard shortcuts

**Key State:**
```typescript
const [isDrawing, setIsDrawing] = useState(false);
const [currentPoints, setCurrentPoints] = useState<Point[]>([]);
const [isPanning, setIsPanning] = useState(false);
const [panStart, setPanStart] = useState<Point | null>(null);
const [viewOffset, setViewOffset] = useState({ x: 0, y: 0 });
const [zoom, setZoom] = useState(1);
const [selectedObjects, setSelectedObjects] = useState<Set<string>>(new Set());
```

**Input Flow:**
```
onPointerDown → Start drawing/panning
     ↓
onPointerMove → Update current stroke/pan
     ↓
onPointerUp → Finalize stroke, add to store
     ↓
Store update → Triggers re-render
```

**Critical Functions:**
- `renderFrame()` - Main render loop (uses requestAnimationFrame)
- `screenToWorld()` / `worldToScreen()` - Coordinate conversion
- `handlePointerDown/Move/Up()` - Input handling
- `handleWheel()` - Zoom
- `drawObject()` - Render individual object

### `src/components/ProjectManager.tsx` (1500+ lines)

**Responsibilities:**
- List projects (cloud or local)
- Create/load/delete/share projects
- Folder management
- Guest banner and UI
- Project thumbnails (planned)

**Key State:**
```typescript
const [projects, setProjects] = useState<ProjectListItem[]>([]);
const [folders, setFolders] = useState<FolderRecord[]>([]);
const [filter, setFilter] = useState<FilterType>('all');
const [searchQuery, setSearchQuery] = useState('');
const [sharingProject, setSharingProject] = useState<ProjectListItem | null>(null);
```

**Guest-Specific Logic:**
```typescript
// Guest banner (dismissable)
const [guestBannerDismissed, setGuestBannerDismissed] = useState(() => {
  return localStorage.getItem('guest-banner-dismissed') === 'true';
});

// Hide collaboration features for guests
{!isGuest && (
  <DropdownMenuItem onSelect={() => setSharingProject(project)}>
    <Share2 className="w-4 h-4 mr-2" />
    Share
  </DropdownMenuItem>
)}
```

**Load Flow:**
```typescript
const handleLoad = async (id: string) => {
  const token = await getToken();
  const record = await getProject(id, token);
  const objects = deserializeProject(record.data);
  
  setObjects(objects);  // Update store
  replaceHistory(objects);
  setCurrentProject(record.id);
  setProjectRole(record.role || 'owner');
  markSaved();
  
  if (onSelect) onSelect();  // Close dialog
};
```

### `src/lib/localProjects.ts` (300+ lines)

**Responsibilities:**
- IndexedDB wrapper for guest projects
- localStorage fallback if IndexedDB fails
- CRUD operations for local projects

**Database Schema:**
```typescript
// IndexedDB: "drawingProjects" database
// Store: "projects"
interface LocalProject {
  id: string;
  title: string;
  data: string;  // Serialized DrawingObject[]
  createdAt: number;
  updatedAt: number;
  guestId: string;  // Owner guest ID
}
```

**Key Methods:**
```typescript
class LocalProjectsService {
  async list(): Promise<ProjectListItem[]>
  async get(id: string): Promise<ProjectRecord>
  async create(title: string, data: string): Promise<string>
  async update(id: string, title: string, data: string): Promise<void>
  async delete(id: string): Promise<void>
  
  // Migration support (NOT IMPLEMENTED IN UI YET)
  async getAllForMigration(): Promise<LocalProject[]>
  async clearAll(): Promise<void>
}
```

**Error Handling:**
```typescript
async list(): Promise<ProjectListItem[]> {
  try {
    const db = await this.openDB();
    // ... IndexedDB read
  } catch (indexedDBError) {
    console.warn('IndexedDB failed, trying localStorage', indexedDBError);
    try {
      const data = localStorage.getItem('local-projects');
      return data ? JSON.parse(data) : [];
    } catch (localStorageError) {
      console.error('Both IndexedDB and localStorage failed');
      return []; // Return empty array instead of throwing
    }
  }
}
```

### `src/server/index.ts` (500+ lines)

**Responsibilities:**
- Express server setup
- REST API routes
- Socket.IO server
- Clerk webhook handler (user sync)
- Database connection

**API Routes:**
```typescript
// Projects
GET    /api/projects          - List user's projects
GET    /api/projects/:id      - Get project by ID
POST   /api/projects          - Create new project
PATCH  /api/projects/:id      - Update project
DELETE /api/projects/:id      - Delete project

// Folders
GET    /api/folders           - List user's folders
POST   /api/folders           - Create folder
PATCH  /api/folders/:id       - Update folder
DELETE /api/folders/:id       - Delete folder

// Collaboration
POST   /api/projects/:id/share      - Share project with user
DELETE /api/projects/:id/share/:uid - Revoke access
GET    /api/shared                  - List projects shared with me

// Users
GET    /api/users/search?q=email    - Search users by email
```

**Socket.IO Events:**
```typescript
io.on('connection', (socket) => {
  socket.on('project:join', (projectId) => {
    socket.join(`project:${projectId}`);
  });
  
  socket.on('drawing:update', (data) => {
    socket.to(`project:${data.projectId}`).emit('drawing:update', data);
  });
  
  socket.on('cursor:move', (data) => {
    socket.to(`project:${data.projectId}`).emit('cursor:move', data);
  });
});
```

**Clerk Webhook:**
```typescript
POST /api/webhooks/clerk
// Syncs user creation/updates/deletions from Clerk to local database
// Signature verification with webhook secret
```

---

## Database Schema (Prisma)

```prisma
model User {
  id             String          @id
  email          String?         @unique
  name           String?
  imageUrl       String?
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt
  
  projects       Project[]       @relation("OwnedProjects")
  collaborations Collaborator[]
  folders        Folder[]
}

model Project {
  id            String          @id @default(uuid())
  title         String
  data          String          @db.Text  // JSON serialized objects
  createdAt     DateTime        @default(now())
  updatedAt     DateTime        @updatedAt
  folderId      String?
  
  owner         User            @relation("OwnedProjects", fields: [ownerId], references: [id], onDelete: Cascade)
  ownerId       String
  folder        Folder?         @relation(fields: [folderId], references: [id])
  collaborators Collaborator[]
}

model Collaborator {
  id          String   @id @default(uuid())
  role        String   // "editor" | "viewer"
  createdAt   DateTime @default(now())
  
  project     Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  projectId   String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId      String
  
  @@unique([projectId, userId])
}

model Folder {
  id        String    @id @default(uuid())
  name      String
  color     String?
  createdAt DateTime  @default(now())
  
  owner     User      @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  ownerId   String
  projects  Project[]
}
```

---

## Common Workflows

### 1. New Guest Starts Drawing

```
1. User visits site (no auth)
2. authStore.ts generates guestId (UUID) → localStorage
3. User clicks "Start Drawing"
4. DrawingCanvas mounts
5. User selects tool (pen, line, etc.)
6. User draws → objects added to store
7. After 2s idle → AutoSaveHandler triggers
8. localProjectsService.create() → IndexedDB
9. Project appears in "My Projects" list
```

### 2. Guest Signs In

```
1. Guest has 3 local projects in IndexedDB
2. User clicks "Sign In" → Clerk modal
3. Auth succeeds → authStore.setUserId()
4. ⚠️ MISSING: Migration not triggered (BUG)
5. Local projects abandoned
6. User sees empty project list (confusing)

SHOULD BE:
4. Trigger migration:
   - Get all local projects
   - Upload to server with token
   - Clear IndexedDB
   - Show success toast
5. User sees all projects in cloud
```

### 3. Authenticated User Draws

```
1. User signs in
2. Selects existing project or creates new
3. DrawingCanvas mounts
4. Socket.IO connects (useSocket)
5. Joins project room: socket.emit('project:join', projectId)
6. User draws → objects added to store
7. After 2s idle → AutoSaveHandler triggers
8. API: PATCH /api/projects/:id with serialized data
9. Other users in room get real-time updates via socket
```

### 4. Real-Time Collaboration

```
User A:
1. Draws stroke
2. onPointerUp → addObject(newPath)
3. Store update triggers effect in DrawingCanvas
4. socket.emit('drawing:update', { projectId, object: newPath })

User B (in same project):
5. socket.on('drawing:update', (data) => {
     addObject(data.object)  // Add to local store
     requestFullRedraw()     // Re-render canvas
   })
6. User B sees User A's stroke appear
```

### 5. Export to PDF

```
1. User clicks "Export" → "PDF"
2. exportToPDF() in export.ts
3. html2canvas renders canvas to image
4. jsPDF creates PDF with image
5. Browser downloads file
6. Analytics event logged (if configured)
```

---

## Important Constants & Configuration

### Canvas Constants
```typescript
// In DrawingCanvas.tsx
const WORLD_WIDTH = 10000;
const WORLD_HEIGHT = 10000;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;
const ZOOM_SPEED = 0.002;
```

### Colors & Theme
```typescript
// In drawingStore.ts
const DEFAULT_COLOR = '#000000';
const DEFAULT_SIZE = 2;
const DEFAULT_FILL = 'transparent';

// Sticky note colors
const STICKY_COLORS = [
  '#fef3c7', // yellow
  '#dbeafe', // blue
  '#d1fae5', // green
  '#fce7f3', // pink
];
```

### API Configuration
```typescript
// In config/env.ts
export const config = {
  apiUrl: import.meta.env.VITE_API_URL || 'http://localhost:5000',
  clerkPublishableKey: import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
  wsUrl: import.meta.env.VITE_WS_URL || 'http://localhost:5000',
};
```

---

## Testing Approach

### Unit Tests (Vitest)
```typescript
// src/__tests__/lib/*.test.ts
describe('geometry utilities', () => {
  it('calculates distance between points', () => {
    const p1 = { x: 0, y: 0 };
    const p2 = { x: 3, y: 4 };
    expect(distance(p1, p2)).toBe(5);
  });
});
```

### Component Tests (Testing Library)
```typescript
// src/__tests__/components/*.test.tsx
describe('ColorPicker', () => {
  it('changes color on click', () => {
    render(<ColorPicker value="#000" onChange={mockOnChange} />);
    fireEvent.click(screen.getByLabelText('Red'));
    expect(mockOnChange).toHaveBeenCalledWith('#ff0000');
  });
});
```

### E2E Tests (Planned)
```typescript
// Future: Playwright tests
test('guest can draw and save', async ({ page }) => {
  await page.goto('/');
  await page.click('[data-testid="start-drawing"]');
  // ... draw strokes
  await page.click('[data-testid="save"]');
  await expect(page.getByText('Project saved')).toBeVisible();
});
```

---

## Environment Variables

### Frontend (`.env`)
```bash
VITE_API_URL=http://localhost:5000
VITE_WS_URL=http://localhost:5000
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
```

### Backend (`.env`)
```bash
DATABASE_URL=postgresql://user:pass@localhost:5432/livedraw
CLERK_SECRET_KEY=sk_test_...
CLERK_WEBHOOK_SECRET=whsec_...
PORT=5000
NODE_ENV=development
```

---

## Deployment

### Production Build
```bash
pnpm build
# Output: dist/
# - Frontend assets in dist/assets/
# - Server in dist/index.js
```

### Docker
```dockerfile
# Dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY dist/ ./dist/
CMD ["node", "dist/index.js"]
```

### Docker Compose
```yaml
# docker-compose.yml
services:
  app:
    build: .
    ports:
      - "5000:5000"
    environment:
      - DATABASE_URL=postgresql://postgres:postgres@db:5432/livedraw
  
  db:
    image: postgres:15
    environment:
      - POSTGRES_DB=livedraw
      - POSTGRES_PASSWORD=postgres
```

---

## Known Issues & Gotchas

### 🔥 Critical
1. **Guest project migration not implemented** - Users lose local projects when signing in
2. **Autosave can lose work** - Browser crash within 2s window loses changes
3. **No conflict resolution** - Concurrent edits can cause inconsistent state

### ⚠️ Important
4. **TypeScript errors in ProjectManager.tsx** - 31 errors about possibly undefined properties (obj.x, obj.y)
5. **Socket.IO doesn't sync full state** - Late joiners don't get canvas snapshot
6. **No retry on save failure** - Network errors silently fail
7. **Performance degrades at 1000+ objects** - No spatial indexing or culling

### 💡 Minor
8. **Eyedropper tool doesn't work** - Shortcut exists but no implementation
9. **No project thumbnails** - All projects show generic icon
10. **Guest banner can be annoying** - Now dismissable, but reappears on page reload (fixed)
11. **Dark mode color contrast issues** - Some UI elements hard to read

---

## Code Style & Conventions

### TypeScript
- Strict mode enabled
- Prefer `interface` over `type` for object shapes
- Use `const` over `let` where possible
- Explicit return types on functions

### React
- Functional components only (no classes)
- Custom hooks for reusable logic
- Prefer composition over prop drilling
- Use Zustand for global state, useState for local

### Naming
- Components: PascalCase (`DrawingCanvas.tsx`)
- Hooks: camelCase with `use` prefix (`useSocket.ts`)
- Utils: camelCase (`geometry.ts`)
- Constants: UPPER_SNAKE_CASE (`WORLD_WIDTH`)
- CSS: kebab-case or Tailwind classes

### File Organization
```typescript
// Component file structure:
import statements
type definitions
component definition
  - state hooks
  - effect hooks
  - event handlers
  - render logic
export statement
```

---

## Performance Considerations

### Current Bottlenecks
1. **Canvas Re-render** - All objects re-rendered every frame
2. **Object Selection** - Linear search through all objects
3. **Socket.IO Events** - Too frequent cursor updates (60fps)
4. **No Virtualization** - All objects in memory/DOM

### Optimizations Applied
1. `requestAnimationFrame` for rendering
2. Pointer events (better than mouse + touch)
3. Canvas caching (via `willReadFrequently`)
4. Web Worker for rendering (partially implemented)

### Planned Optimizations
1. Spatial indexing (QuadTree) for object queries
2. Dirty rectangle optimization (only redraw changed areas)
3. Object pooling for Point objects
4. Canvas layer separation (static vs dynamic)
5. Throttle cursor position updates (from 60fps to 15fps)

---

## Security Considerations

### Authentication
- Clerk handles all auth (secure by default)
- JWTs verified on server via Clerk SDK
- Webhook signature verification for user sync

### Authorization
- Row-level security via Prisma queries:
  ```typescript
  // Only return projects user owns or is collaborator on
  const projects = await prisma.project.findMany({
    where: {
      OR: [
        { ownerId: userId },
        { collaborators: { some: { userId } } }
      ]
    }
  });
  ```

### Data Validation
- Input sanitization on server
- DOMPurify for rich text (sticky notes)
- File upload size limits (images)
- Rate limiting on API (planned)

### XSS Prevention
- React auto-escapes by default
- DOMPurify for user HTML
- CSP headers (planned)

---

## Debugging Tips

### Common Issues

**"Failed to load projects" error:**
```typescript
// Check:
1. Is user authenticated? (console: authStore.getState())
2. Is token valid? (console: await clerk.session?.getToken())
3. Is API server running? (localhost:5000)
4. Check network tab for 401/403
```

**Canvas not rendering:**
```typescript
// Check:
1. Are objects in store? (console: drawingStore.getState().objects)
2. Is redraw requested? (console: drawingStore.getState().isFullRedrawRequested)
3. Are coordinates in viewport? (worldToScreen calculation)
4. Check canvas context: ctx.getContextAttributes()
```

**Socket not connecting:**
```typescript
// Check:
1. Is user authenticated? (guests don't connect)
2. Is token passed to socket? (useSocket.ts)
3. Is server Socket.IO running? (server logs)
4. Check browser console for socket errors
```

### Useful Console Commands

```javascript
// Get current state
drawingStore.getState()
authStore.getState()

// Force redraw
drawingStore.getState().requestFullRedraw()

// Clear canvas
drawingStore.getState().setObjects([])

// Get guest ID
localStorage.getItem('drawing-guest-id')

// Get local projects
(await indexedDB.databases()).find(db => db.name === 'drawingProjects')
```

---

## Quick Reference: Common Tasks

### Add New Tool
```typescript
// 1. Add to Tool type (drawingStore.ts)
type Tool = 'pen' | 'line' | 'rectangle' | 'ellipse' | 'text' | 'NEW_TOOL';

// 2. Add icon to Toolbar (DrawingToolbar.tsx)
<button onClick={() => setCurrentTool('NEW_TOOL')}>
  <NewToolIcon />
</button>

// 3. Handle in DrawingCanvas (handlePointerDown/Move/Up)
if (currentTool === 'NEW_TOOL') {
  // Drawing logic
}

// 4. Add render logic (drawObject function)
case 'NEW_TOOL':
  // Render logic
  break;
```

### Add New API Route
```typescript
// 1. Add route in server/index.ts
app.get('/api/new-route', requireAuth, async (req, res) => {
  const userId = req.auth.userId;
  // Business logic
  res.json({ data });
});

// 2. Add API function in lib/api.ts
export async function getNewData(token: string): Promise<Data> {
  return httpWithRetry<Data>('/api/new-route', undefined, token);
}

// 3. Use in component
const data = await getNewData(token);
```

### Add New Object Type
```typescript
// 1. Add to DrawingObject type
interface NewObject {
  id: string;
  type: 'new-type';
  x: number;
  y: number;
  // ... properties
}

// 2. Update serialization (drawFormat.ts)
// Usually works automatically with JSON.stringify

// 3. Add rendering (DrawingCanvas.tsx)
case 'new-type':
  ctx.fillRect(obj.x, obj.y, ...);
  break;

// 4. Add creation logic (DrawingCanvas.tsx)
const newObj: NewObject = {
  id: generateId(),
  type: 'new-type',
  x: screenX,
  y: screenY,
};
addObject(newObj);
```

---

## Resources & Documentation

### External Docs
- [Clerk Auth](https://clerk.com/docs) - Authentication
- [Prisma](https://www.prisma.io/docs) - Database ORM
- [Socket.IO](https://socket.io/docs/v4/) - WebSockets
- [Zustand](https://github.com/pmndrs/zustand) - State management
- [Canvas API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API) - Drawing

### Internal Docs
- `IMPROVEMENTS.md` - Recommended improvements and roadmap
- `docs/deployment.md` - Deployment guide
- `README.md` - Project overview and setup

### Code Examples
- Shape detection: `src/lib/shapeDetectors/`
- Export formats: `src/lib/export.ts`
- API client: `src/lib/api.ts`
- Local storage: `src/lib/localProjects.ts`

---

## Agent Guidance: How to Help

### When User Reports a Bug
1. Ask for reproduction steps
2. Check if it's guest vs authenticated mode
3. Look at browser console logs
4. Check network tab for failed requests
5. Review relevant component state
6. Check if issue is in known issues list

### When Adding Features
1. Consider guest vs authenticated implications
2. Update both UI and server if needed
3. Add to DrawingObject type if new object
4. Update serialization if data structure changes
5. Add TypeScript types
6. Test on mobile/touch if UI change

### When Refactoring
1. Check for breaking changes in stores
2. Update all consumers of changed interfaces
3. Run TypeScript compiler (`pnpm tsc`)
4. Test critical paths (draw, save, load)
5. Check for performance impact

### Code Review Checklist
- [ ] TypeScript errors fixed
- [ ] Works for both guests and authenticated
- [ ] Mobile/touch considered
- [ ] Error handling added
- [ ] State updates are immutable
- [ ] No unnecessary re-renders
- [ ] Console logs removed (or debug only)
- [ ] Accessibility (ARIA labels, keyboard nav)

---

## Version History

- **v1.0** - Initial release with basic drawing
- **v1.1** - Added authentication (Clerk)
- **v1.2** - Real-time collaboration (Socket.IO)
- **v1.3** - Guest mode with IndexedDB
- **v1.4** - Shape detection
- **v1.5** - Folders and project management
- **v1.6** - Export to PDF/PNG/SVG
- **v1.7** - Mobile/touch improvements
- **v1.8** (current) - Guest mode polish, UI improvements

---

## Contact & Support

**Repository:** `/home/manan/Documents/dev/live_test/`
**Author:** Manan
**Tech Stack:** React + TypeScript + Node.js + PostgreSQL
**License:** (TBD)

For questions or issues, check:
1. This AGENT_CONTEXT.md file
2. IMPROVEMENTS.md for known issues
3. Code comments in critical files
4. External documentation links above

---

*Last Updated: January 2025*
*This document should be updated whenever major architectural changes are made.*
