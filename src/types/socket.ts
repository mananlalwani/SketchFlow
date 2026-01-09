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
  createdBy?: string;  // User ID who created this stroke
  createdAt?: number;  // Timestamp when created
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
  points?: { x: number; y: number }[];  // For custom triangles and other shapes with custom vertices
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  properties?: Record<string, any>;  // For shape-specific properties (e.g., star point count)
  timestamp?: number;
  createdBy?: string;  // User ID who created this shape
  createdAt?: number;  // Timestamp when created
  lastModifiedBy?: string;  // User ID who last modified
  lastModifiedAt?: number;  // Timestamp of last modification
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

// Project file format for import/export
export type ProjectVersion = '1.0.0';

export interface ProjectStroke {
  id: string;
  type: 'stroke';
  points: { x: number; y: number }[];
  color: string;
  size: number;
  alpha?: number;
}

export interface ProjectShapeLine {
  id: string;
  type: 'line';
  x: number; y: number; width: number; height: number;
  color: string; size: number; alpha?: number;
}

export interface ProjectShapeRect {
  id: string;
  type: 'rectangle';
  x: number; y: number; width: number; height: number;
  color: string; size: number; alpha?: number; filled?: boolean;
}

export interface ProjectShapeEllipse {
  id: string;
  type: 'ellipse';
  x: number; y: number; width: number; height: number;
  color: string; size: number; alpha?: number; filled?: boolean;
}

export interface ProjectShapeParabola {
  id: string;
  type: 'parabola';
  x: number; y: number; width: number; height: number;
  color: string; size: number; alpha?: number; orientation?: 'up' | 'down' | 'left' | 'right';
}

export interface ProjectShapeCircle {
  id: string;
  type: 'circle';
  x: number; y: number; width: number; height: number;
  color: string; size: number; alpha?: number; filled?: boolean;
}

export interface ProjectShapeTriangle {
  id: string;
  type: 'triangle';
  x: number; y: number; width: number; height: number;
  color: string; size: number; alpha?: number; filled?: boolean;
}

export interface ProjectShapeText {
  id: string;
  type: 'text';
  x: number; y: number; width: number; height: number;
  color: string; size: number; alpha?: number;
  text: string;
  fontSize: number;
}

export interface ProjectShapeImage {
  id: string;
  type: 'image';
  x: number; y: number; width: number; height: number;
  color: string; size: number; alpha?: number;
  imageData: string;
}

export type ProjectObject = ProjectStroke | ProjectShapeLine | ProjectShapeRect | ProjectShapeEllipse | ProjectShapeCircle | ProjectShapeTriangle | ProjectShapeParabola | ProjectShapeText | ProjectShapeImage;

export interface ProjectFile {
  version: ProjectVersion;
  meta?: { title?: string; createdAt?: number; updatedAt?: number };
  world: { width: number; height: number; background: string };
  objects: ProjectObject[];
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  'project:state': (data: { objects: any[]; timestamp: number }) => void;  // Full state sync for late joiners
  'object:delete': (objectId: string, userId: string) => void;  // Object deletion event
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
  'project:request-state': () => void;  // Request full state from server
  'object:delete': (objectId: string) => void;  // Delete an object
}


