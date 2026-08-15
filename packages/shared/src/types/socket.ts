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
  /** Raw PointerEvent pressure when available (0..1). */
  pressure?: number;
}

/** Retained stroke point. `width` keeps pen pressure intact after save/reload. */
export interface StrokePoint {
  x: number;
  y: number;
  pressure?: number;
  width?: number;
}

export type JsonPrimitive = string | number | boolean | null;
export interface JsonObject {
  [key: string]: JsonValue | undefined;
}
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export interface DrawingData {
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
    | 'star'
    | 'arrow';
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
  points?: StrokePoint[];
  properties?: JsonObject;
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
  /** Per-connection identity; unlike userId this distinguishes a user's devices. */
  clientId?: string;
  userId: string;
  username: string;
  x: number;
  y: number;
  color: string;
  timestamp?: number;
}

/** Ephemeral, per-device selection presence. Never persisted with project data. */
export interface SelectionPresence {
  clientId?: string;
  userId: string;
  username: string;
  objectIds: string[];
  color: string;
  timestamp?: number;
}

// Project file format
export type ProjectVersion = '1.0.0';

export interface ProjectStroke {
  id: string;
  type: 'stroke';
  points: StrokePoint[];
  color: string;
  size: number;
  alpha?: number;
}

export interface ProjectDrawingLine {
  id: string;
  type: 'line';
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  size: number;
  alpha?: number;
}

export interface ProjectDrawingRect {
  id: string;
  type: 'rectangle';
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  size: number;
  alpha?: number;
  filled?: boolean;
}

export interface ProjectDrawingEllipse {
  id: string;
  type: 'ellipse';
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  size: number;
  alpha?: number;
  filled?: boolean;
}

export interface ProjectDrawingParabola {
  id: string;
  type: 'parabola';
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  size: number;
  alpha?: number;
  orientation?: 'up' | 'down' | 'left' | 'right';
}

export interface ProjectDrawingCircle {
  id: string;
  type: 'circle';
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  size: number;
  alpha?: number;
  filled?: boolean;
}

export interface ProjectDrawingTriangle {
  id: string;
  type: 'triangle';
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  size: number;
  alpha?: number;
  filled?: boolean;
}

export interface ProjectDrawingText {
  id: string;
  type: 'text';
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  size: number;
  alpha?: number;
  text: string;
  fontSize: number;
}

export interface ProjectDrawingImage {
  id: string;
  type: 'image';
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  size: number;
  alpha?: number;
  imageData: string;
}

export type ProjectObject =
  | ProjectStroke
  | ProjectDrawingLine
  | ProjectDrawingRect
  | ProjectDrawingEllipse
  | ProjectDrawingCircle
  | ProjectDrawingTriangle
  | ProjectDrawingParabola
  | ProjectDrawingText
  | ProjectDrawingImage;

export interface ProjectFile {
  version: ProjectVersion;
  meta?: { title?: string; createdAt?: number; updatedAt?: number };
  world: { width: number; height: number; background: string };
  objects: ProjectObject[];
}

export interface CollaborationCommit {
  protocolVersion: 1;
  projectId: string;
  operationId: string;
  expectedRevision: number;
  kind: 'replace-project' | 'upsert-object' | 'delete-object' | 'batch';
  data: JsonValue;
  title?: string;
}

export type CollaborationCommitResult =
  | {
      status: 'applied';
      operationId: string;
      revision: number;
      data: JsonValue;
      title: string;
    }
  | { status: 'duplicate'; operationId: string; revision: number }
  | { status: 'conflict'; operationId: string; currentRevision: number }
  | {
      status: 'forbidden' | 'not_found' | 'invalid' | 'too_large' | 'unavailable';
      operationId: string;
    };

export interface CollaborationAppliedEvent {
  projectId: string;
  operationId: string;
  revision: number;
  kind: 'replace-project' | 'upsert-object' | 'delete-object' | 'batch';
  data: JsonValue;
  title: string;
}

export interface CollaborationHydration {
  projectId: string;
  revision: number;
  data: JsonValue;
  title: string;
}

export interface ServerToClientEvents {
  'connection:count': (count: number) => void;
  'cursor:move': (cursor: CursorData) => void;
  'cursor:join': (cursor: CursorData) => void;
  'cursor:leave': (userId: string) => void;
  'cursors:all': (cursors: CursorData[]) => void;
  'selection:change': (selection: SelectionPresence) => void;
  'selection:leave': (clientId: string) => void;
  'selections:all': (selections: SelectionPresence[]) => void;
  'collaboration:hydrated': (state: CollaborationHydration) => void;
  'collaboration:applied': (event: CollaborationAppliedEvent) => void;
  error: (error: { status: 429; error: string }) => void;
}

export interface ClientToServerEvents {
  'cursor:move': (cursor: CursorData) => void;
  'selection:change': (selection: SelectionPresence) => void;
  'room:join': (projectId: string) => void;
  'room:leave': () => void;
  'collaboration:commit': (
    commit: CollaborationCommit,
    acknowledge: (result: CollaborationCommitResult) => void,
  ) => void;
}

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  userId?: string;
  userName?: string;
  sessionExpiresAt?: number;
  /** A public share-link socket is scoped to this one read-only project. */
  sharedProjectId?: string;
  shareToken?: string;
}
