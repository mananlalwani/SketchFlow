import type { DrawingObject } from '../lib/drawingObjectSchema';
import type { CanvasInputMode, FingerAction } from '../lib/canvasInputPolicy';
import type { ProjectBookmark } from '../lib/projectDocument';
import type { CollaborationSyncStatus } from '../lib/collaborationPersistence';

export type { DrawingObject } from '../lib/drawingObjectSchema';
export type { ProjectBookmark } from '../lib/projectDocument';
export type SaveStatus = 'saved' | 'failed' | CollaborationSyncStatus;

export type Tool =
  | 'pen'
  | 'highlighter'
  | 'eraser'
  | 'line'
  | 'rectangle'
  | 'ellipse'
  | 'triangle'
  | 'star'
  | 'text'
  | 'eyedropper'
  | 'hand'
  | 'select'
  // Kept to read older persisted sessions; new UI and shortcuts use `select`.
  | 'move'
  | 'image';

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
}

export interface DrawingState {
  // Canvas state
  objects: DrawingObject[];
  currentTool: Tool;
  eraserMode: 'partial' | 'object';
  needsFullRedraw: boolean;
  projectTitle: string;
  unsavedChanges: boolean;
  documentVersion: number;
  saveStatus: SaveStatus;
  lastSavedAt?: number;
  currentProjectId?: string;
  projectRevision?: number;
  projectRole?: 'owner' | 'editor' | 'viewer' | null;
  bookmarks: ProjectBookmark[];
  brushSize: number;
  /** Pixel size used when creating new text objects. Kept separate from brush width. */
  textFontSize: number;
  brushColor: string;
  brushOpacity: number;
  /** Pen settings are kept separate so switching tools never loses either profile. */
  penSize: number;
  penColor: string;
  penOpacity: number;
  highlighterSize: number;
  highlighterColor: string;
  highlighterOpacity: number;
  selectedObjectId?: string;
  selectedObjectIds: string[];

  // UI state
  isConnected: boolean;
  showToolbar: boolean;
  viewMode: 'draw' | 'view';
  drawingFilled: boolean;
  triangleMode: 'custom' | 'right' | '45-45-90' | '30-60-90';
  starPoints: 5 | 6 | 8;
  autoDrawing: boolean;
  inputMode: CanvasInputMode;
  fingerAction: FingerAction;
  /** Session-only Auto mode state; intentionally excluded from persistence. */
  sessionStylusSuppression: boolean;
  autoDrawingThresholds: {
    closureFactor: number; // 0-1 factor of diag for closure tolerance
    rectCornerMin: number; // integer corners threshold
    rectStraightRatio: number; // 0-1
    ellipseError: number; // 0-1
    parabolaError: number; // 0-1
    lineError: number; // 0-1
    winnerMargin: number; // 0-1 how much the winner must beat next best
    minSizePx: number; // min bbox side in world px
    resampleStep: number; // world px spacing for resampling
    minParabolaCurvature: number; // radians
    // New improved thresholds
    triangleError: number; // max error for triangle detection
    circleRoundnessTolerance: number; // how round a shape needs to be for circle detection
    minConfidence: number; // minimum confidence threshold for any shape
    symmetryWeight: number; // weight given to symmetry in detection
  };

  objectCount: number;

  // History
  history: DrawingObject[][];
  historyIndex: number;
  maxHistorySize: number;

  // Custom colors
  customColors: string[];

  // View state (for panning/zooming)
  zoom: number;
  viewX: number;
  viewY: number;

  // Actions
  setTool: (tool: Tool) => void;
  setEraserMode: (mode: 'partial' | 'object') => void;
  setObjects: (objects: DrawingObject[]) => void;
  applyAuthoritativeProject: (input: {
    objects: DrawingObject[];
    title: string;
    revision: number;
    bookmarks?: ProjectBookmark[];
  }) => boolean;
  hydrateProject: (input: {
    id: string;
    objects: DrawingObject[];
    title: string;
    revision?: number;
    role: 'owner' | 'editor' | 'viewer';
    bookmarks?: ProjectBookmark[];
  }) => void;
  replaceHistory: (objects: DrawingObject[]) => void;
  requestFullRedraw: () => void;
  clearFullRedraw: () => void;
  setProjectTitle: (title: string) => void;
  markSaved: (documentVersion?: number) => void;
  markDirty: () => void;
  setSaveStatus: (status: SaveStatus) => void;
  newProject: () => void;
  setCurrentProject: (id: string | undefined) => void;
  setProjectRevision: (revision: number | undefined) => void;
  setProjectRole: (role: 'owner' | 'editor' | 'viewer' | null) => void;
  setBrushSize: (size: number) => void;
  setTextFontSize: (size: number) => void;
  setBrushColor: (color: string) => void;
  setBrushOpacity: (opacity: number) => void;
  setSelectedObject: (id: string | undefined) => void;
  setSelectedObjects: (ids: string[]) => void;
  toggleSelectedObject: (id: string) => void;
  updateObject: (id: string, changes: Partial<DrawingObject>) => void;

  addObject: (object: DrawingObject) => void;
  removeObject: (id: string) => void;
  clearCanvas: () => void;

  setConnectionStatus: (connected: boolean) => void;
  toggleToolbar: () => void;
  setViewMode: (mode: 'draw' | 'view') => void;
  setDrawingFilled: (filled: boolean) => void;
  setTriangleMode: (mode: 'custom' | 'right' | '45-45-90' | '30-60-90') => void;
  setStarPoints: (points: 5 | 6 | 8) => void;
  setAutoDrawing: (enabled: boolean) => void;
  setInputMode: (mode: CanvasInputMode) => void;
  setFingerAction: (action: FingerAction) => void;
  setSessionStylusSuppression: (enabled: boolean) => void;
  setAutoDrawingThresholds: (t: Partial<DrawingState['autoDrawingThresholds']>) => void;

  // History actions
  saveHistory: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // Color management
  addCustomColor: (color: string) => void;
  removeCustomColor: (color: string) => void;

  // View actions
  setZoom: (zoom: number) => void;
  setView: (x: number, y: number) => void;
  resetView: () => void;
  createBookmark: (name?: string) => ProjectBookmark;
  addBookmark: (name?: string) => ProjectBookmark;
  renameBookmark: (id: string, name: string) => boolean;
  updateBookmark: (id: string, name: string) => boolean;
  deleteBookmark: (id: string) => boolean;
  removeBookmark: (id: string) => boolean;
  restoreBookmark: (id: string) => boolean;
  jumpToBookmark: (id: string) => boolean;
  setBookmarks: (bookmarks: ProjectBookmark[]) => void;
}
