export type InitMessage = {
  type: 'init';
  canvas: OffscreenCanvas;
  worldWidth: number;
  worldHeight: number;
};

export type Stroke = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  color: string;
  size: number;
  alpha?: number;
  groupId?: string;
  pressure?: number;
};

export type StrokeMessage = {
  type: 'stroke';
  data: Stroke;
};
export type StrokesMessage = { type: 'strokes'; data: Stroke[] };

export interface DrawingProperties {
  pointCount?: number;
  rotation?: number;
  hidden?: boolean;
}

export type Drawing = {
  id: string;
  type:
    | 'stroke'
    | 'line'
    | 'rectangle'
    | 'ellipse'
    | 'circle'
    | 'triangle'
    | 'parabola'
    | 'text'
    | 'image'
    | 'arrow'
    | 'star';
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  size: number;
  alpha: number;
  filled?: boolean;
  orientation?: 'up' | 'down' | 'left' | 'right';
  points?: { x: number; y: number; width?: number }[]; // Strokes, custom triangle vertices, arrows
  text?: string;
  fontSize?: number;
  imageData?: string; // Base64 data URL for images
  properties?: DrawingProperties;
};

export type PathContext = Pick<OffscreenCanvasRenderingContext2D, 'moveTo' | 'lineTo'>;
export type ParabolaDrawing = Pick<Drawing, 'x' | 'y' | 'width' | 'height' | 'orientation' | 'points'>;

export type DrawingMessage = {
  type: 'shape';
  data: Drawing;
};
export type ClearDrawingMessage = {
  type: 'clear-shape';
  data: Drawing;
};

export type ViewportMessage = {
  type: 'viewport';
  zoom: number;
  viewX: number;
  viewY: number;
  canvasWidth: number;
  canvasHeight: number;
  dpr: number;
  sequence?: number;
};

export type ClearMessage = { type: 'clear' };
export type ClearRegionMessage = {
  type: 'clear-region';
  x: number;
  y: number;
  width: number;
  height: number;
};
export type RemoveGroupMessage = { type: 'remove-group'; groupId: string };
export type SnapshotMessage = { type: 'snapshot' };
export type SnapshotImageMessage = {
  type: 'snapshot-image';
  dataUrl: string;
  worldWidth?: number;
  worldHeight?: number;
};
export type ThemeMessage = { type: 'theme'; bgColor: string };
export type LoadObjectsMessage = { type: 'load-objects'; data: Drawing[] };
export type LoadSceneMessage = {
  type: 'load-scene';
  requestId: string;
  drawings: Drawing[];
  strokes: Stroke[];
};

export type Inbound =
  | InitMessage
  | StrokeMessage
  | StrokesMessage
  | DrawingMessage
  | ViewportMessage
  | ClearMessage
  | ClearRegionMessage
  | RemoveGroupMessage
  | ClearDrawingMessage
  | SnapshotMessage
  | SnapshotImageMessage
  | ThemeMessage
  | LoadObjectsMessage
  | LoadSceneMessage;

export type Outbound =
  | { type: 'snapshot'; dataUrl: string }
  | { type: 'ready' }
  | { type: 'init-error'; reason: string }
  | { type: 'scene-applied'; requestId: string; objectCount: number; ingestionMs: number }
  | {
      type: 'frame-rendered';
      requestId?: string;
      viewportSequence?: number;
      renderMs: number;
      retainedObjectCount: number;
      visibleObjectCount: number;
      culledObjectCount: number;
    };
