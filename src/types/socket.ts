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
}

export interface ShapeData {
  id: string;
  type: 'line' | 'rectangle' | 'ellipse' | 'circle' | 'triangle' | 'parabola' | 'text';
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
  timestamp?: number;
}

export interface CanvasSnapshot {
  dataUrl: string;
  worldW?: number;
  worldH?: number;
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

export type ProjectObject = ProjectStroke | ProjectShapeLine | ProjectShapeRect | ProjectShapeEllipse | ProjectShapeCircle | ProjectShapeTriangle | ProjectShapeParabola | ProjectShapeText;

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
}

export interface ClientToServerEvents {
  'draw:stroke': (stroke: StrokeData) => void;
  'draw:strokes': (strokes: StrokeData[]) => void;
  'draw:shape': (shape: ShapeData) => void;
  'canvas:snapshot': (snapshot: CanvasSnapshot) => void;
  'canvas:clear': () => void;
}


