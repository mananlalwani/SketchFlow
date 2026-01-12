// Re-export types from shared package
// Note: These types need to be defined here for the server build
// since the shared package may not be built yet

export interface StrokeData {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  color: string;
  size: number;
  alpha?: number;
  blend?: string;
  timestamp?: number;
  groupId?: string;
  createdBy?: string;
  createdAt?: number;
}

export interface ShapeData {
  id: string;
  type: 'line' | 'rectangle' | 'ellipse' | 'circle' | 'triangle' | 'parabola' | 'text' | 'image' | 'star' | 'arrow';
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  size: number;
  alpha: number;
  filled?: boolean;
  orientation?: 'up' | 'down' | 'left' | 'right';
  text?: string;
  fontSize?: number;
  imageData?: string;
  points?: { x: number; y: number }[];
  properties?: Record<string, unknown>;
  timestamp?: number;
  createdBy?: string;
  createdAt?: number;
  lastModifiedBy?: string;
  lastModifiedAt?: number;
}

export interface CanvasSnapshot {
  dataUrl: string;
  worldW?: number;
  worldH?: number;
  timestamp?: number;
}

export interface CursorData {
  userId: string;
  username: string;
  x: number;
  y: number;
  color: string;
  timestamp?: number;
}

export interface ServerToClientEvents {
  'draw:stroke': (stroke: StrokeData) => void;
  'draw:strokes': (strokes: StrokeData[]) => void;
  'draw:shape': (shape: ShapeData) => void;
  'canvas:snapshot': (snapshot: CanvasSnapshot) => void;
  'canvas:clear': () => void;
  'connection:count': (count: number) => void;
  'cursor:move': (cursor: CursorData) => void;
  'cursor:join': (cursor: CursorData) => void;
  'cursor:leave': (userId: string) => void;
  'cursors:all': (cursors: CursorData[]) => void;
  'project:state': (data: { objects: unknown[]; timestamp: number }) => void;
  'object:delete': (objectId: string, userId: string) => void;
}

export interface ClientToServerEvents {
  'draw:stroke': (stroke: StrokeData) => void;
  'draw:strokes': (strokes: StrokeData[]) => void;
  'draw:shape': (shape: ShapeData) => void;
  'canvas:snapshot': (snapshot: CanvasSnapshot) => void;
  'canvas:clear': () => void;
  'cursor:move': (cursor: CursorData) => void;
  'room:join': (projectId: string) => void;
  'room:leave': () => void;
  'project:request-state': () => void;
  'object:delete': (objectId: string) => void;
}


