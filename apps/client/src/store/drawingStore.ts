import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { trackToolSelection, trackObjectCreated, trackFeatureUsage } from '../lib/analytics';
import { FEATURES } from '../config/features';
import type { StrokePoint } from '@sketchflow/shared';

export type Tool =
  | 'pen'
  | 'eraser'
  | 'line'
  | 'rectangle'
  | 'ellipse'
  | 'triangle'
  | 'star'
  | 'text'
  | 'eyedropper'
  | 'hand'
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

export interface DrawingObject {
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
  points?: StrokePoint[];
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  color: string;
  size: number;
  alpha?: number;
  text?: string;
  fontSize?: number;
  filled?: boolean;
  orientation?: 'up' | 'down' | 'left' | 'right';
  imageData?: string; // Base64 data URL for images
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  properties?: Record<string, any>; // Shape-specific properties (e.g., arrow direction, star point count)
  createdBy?: string; // User ID who created this object
  createdAt?: number; // Timestamp when created
  lastModifiedBy?: string; // User ID who last modified
  lastModifiedAt?: number; // Timestamp of last modification
}

interface DrawingState {
  // Canvas state
  objects: DrawingObject[];
  currentTool: Tool;
  eraserMode: 'partial' | 'object';
  needsFullRedraw: boolean;
  projectTitle: string;
  unsavedChanges: boolean;
  documentVersion: number;
  saveStatus: 'saved' | 'syncing' | 'failed' | 'retrying' | 'conflict';
  lastSavedAt?: number;
  currentProjectId?: string;
  projectRevision?: number;
  projectRole?: 'owner' | 'editor' | 'viewer' | null;
  brushSize: number;
  brushColor: string;
  brushOpacity: number;
  selectedObjectId?: string;

  // UI state
  isConnected: boolean;
  showToolbar: boolean;
  viewMode: 'draw' | 'view';
  shapeFilled: boolean;
  triangleMode: 'custom' | 'right' | '45-45-90' | '30-60-90';
  starPoints: 5 | 6 | 8;
  autoShape: boolean;
  autoShapeThresholds: {
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

  // Performance tracking
  fps: number;
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
  }) => boolean;
  hydrateProject: (input: {
    id: string;
    objects: DrawingObject[];
    title: string;
    revision?: number;
    role: 'owner' | 'editor' | 'viewer';
  }) => void;
  replaceHistory: (objects: DrawingObject[]) => void;
  requestFullRedraw: () => void;
  clearFullRedraw: () => void;
  setProjectTitle: (title: string) => void;
  markSaved: (documentVersion?: number) => void;
  markDirty: () => void;
  setSaveStatus: (status: 'saved' | 'syncing' | 'failed' | 'retrying' | 'conflict') => void;
  newProject: () => void;
  setCurrentProject: (id: string | undefined) => void;
  setProjectRevision: (revision: number | undefined) => void;
  setProjectRole: (role: 'owner' | 'editor' | 'viewer' | null) => void;
  setBrushSize: (size: number) => void;
  setBrushColor: (color: string) => void;
  setBrushOpacity: (opacity: number) => void;
  setSelectedObject: (id: string | undefined) => void;
  updateObject: (id: string, changes: Partial<DrawingObject>) => void;

  addObject: (object: DrawingObject) => void;
  removeObject: (id: string) => void;
  clearCanvas: () => void;

  setConnectionStatus: (connected: boolean) => void;
  toggleToolbar: () => void;
  setViewMode: (mode: 'draw' | 'view') => void;
  setShapeFilled: (filled: boolean) => void;
  setTriangleMode: (mode: 'custom' | 'right' | '45-45-90' | '30-60-90') => void;
  setStarPoints: (points: 5 | 6 | 8) => void;
  setAutoShape: (enabled: boolean) => void;
  setAutoShapeThresholds: (t: Partial<DrawingState['autoShapeThresholds']>) => void;

  updatePerformanceStats: (fps: number) => void;

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
}

const defaultColors = [
  '#ffffff',
  '#000000',
  '#ff0000',
  '#00ff00',
  '#0000ff',
  '#ffff00',
  '#ff00ff',
  '#00ffff',
  '#808080',
  '#ffa500',
];

export const useDrawingStore = create<DrawingState>()(
  devtools(
    persist(
      (set, get) => ({
        // Initial state
        objects: [],
        currentTool: 'pen',
        eraserMode: 'partial',
        needsFullRedraw: false,
        projectTitle: 'Untitled',
        unsavedChanges: false,
        documentVersion: 0,
        saveStatus: 'saved',
        currentProjectId: undefined,
        brushSize: 4,
        brushColor: '#ffffff',
        brushOpacity: 1,
        selectedObjectId: undefined,

        isConnected: false,
        showToolbar: true,
        viewMode: 'draw',
        shapeFilled: false,
        triangleMode: 'custom',
        starPoints: 5,
        autoShape: false,
        autoShapeThresholds: {
          closureFactor: 0.15,
          rectCornerMin: 2,
          rectStraightRatio: 0.65,
          ellipseError: 0.3,
          parabolaError: 0.25,
          lineError: 0.15,
          winnerMargin: 0.1,
          minSizePx: 15,
          resampleStep: 2,
          minParabolaCurvature: 1.0,
          // New improved thresholds
          triangleError: 0.2,
          circleRoundnessTolerance: 0.2,
          minConfidence: 0.6,
          symmetryWeight: 0.3,
        },

        fps: 0,
        objectCount: 0,

        history: [[]],
        historyIndex: 0,
        maxHistorySize: 50,

        customColors: defaultColors,

        zoom: 1,
        // Start centered in the world (will be adjusted precisely by canvas on mount)
        viewX: 1548,
        viewY: 1748,

        // Actions
        setTool: (tool) => {
          const previousTool = get().currentTool;
          trackToolSelection(tool, previousTool);
          set({ currentTool: tool });
        },
        setEraserMode: (mode) => set({ eraserMode: mode }),
        setObjects: (objects) =>
          set((state) => ({
            objects,
            objectCount: objects.length,
            selectedObjectId: objects.some((object) => object.id === state.selectedObjectId)
              ? state.selectedObjectId
              : undefined,
            unsavedChanges: true,
            documentVersion: state.documentVersion + 1,
          })),
        applyAuthoritativeProject: ({ objects, title, revision }) => {
          let applied = false;
          set((state) => {
            // An incoming canonical snapshot must never replace local work that has
            // not been durably acknowledged. The subsequent local save either uses
            // this revision or receives a conflict while retaining recovery data.
            if (state.unsavedChanges) return state;

            applied = true;
            return {
              objects,
              objectCount: objects.length,
              projectTitle: title,
              projectRevision: revision,
              unsavedChanges: false,
              documentVersion: state.documentVersion + 1,
              saveStatus: 'saved',
              needsFullRedraw: true,
            };
          });
          return applied;
        },
        hydrateProject: ({ id, objects, title, revision, role }) =>
          set((state) => ({
            currentProjectId: id,
            projectTitle: title,
            projectRevision: revision,
            projectRole: role,
            objects,
            objectCount: objects.length,
            selectedObjectId: undefined,
            history: [objects],
            historyIndex: 0,
            unsavedChanges: false,
            documentVersion: state.documentVersion + 1,
            saveStatus: 'saved',
            lastSavedAt: Date.now(),
            needsFullRedraw: true,
          })),
        replaceHistory: (objects) => set({ history: [objects], historyIndex: 0 }),
        requestFullRedraw: () => set({ needsFullRedraw: true }),
        clearFullRedraw: () => set({ needsFullRedraw: false }),
        setProjectTitle: (title) =>
          set((state) => ({
            projectTitle: title,
            unsavedChanges: true,
            documentVersion: state.documentVersion + 1,
          })),
        markSaved: (documentVersion) =>
          set((state) => {
            if (documentVersion !== undefined && documentVersion !== state.documentVersion) {
              return state;
            }
            return { unsavedChanges: false, lastSavedAt: Date.now(), saveStatus: 'saved' };
          }),
        markDirty: () =>
          set((state) => ({ unsavedChanges: true, documentVersion: state.documentVersion + 1 })),
        setSaveStatus: (status) => set({ saveStatus: status }),
        setProjectRole: (role) => set({ projectRole: role }),
        newProject: () => {
          set((state) => ({
            objects: [],
            objectCount: 0,
            selectedObjectId: undefined,
            history: [[]],
            historyIndex: 0,
            projectTitle: 'Untitled',
            unsavedChanges: false,
            documentVersion: state.documentVersion + 1,
            needsFullRedraw: true,
            currentProjectId: undefined,
            projectRevision: undefined,
            projectRole: 'owner',
          }));
          localStorage.removeItem('lastProjectId');
        },
        setCurrentProject: (id) =>
          set((state) => ({
            currentProjectId: id,
            ...(state.currentProjectId !== id
              ? { projectRevision: undefined, documentVersion: state.documentVersion + 1 }
              : {}),
          })),
        setProjectRevision: (revision) => set({ projectRevision: revision }),
        setBrushSize: (size) => set({ brushSize: Math.max(1, Math.min(100, size)) }),
        setBrushColor: (color) => set({ brushColor: color }),
        setBrushOpacity: (opacity) => set({ brushOpacity: Math.max(0.1, Math.min(1, opacity)) }),
        setSelectedObject: (id) => set({ selectedObjectId: id }),
        updateObject: (id, changes) =>
          set((state) => {
            const index = state.objects.findIndex((object) => object.id === id);
            if (index < 0) return state;
            const objects = [...state.objects];
            objects[index] = { ...objects[index], ...changes };
            return {
              objects,
              unsavedChanges: true,
              documentVersion: state.documentVersion + 1,
              needsFullRedraw: true,
            };
          }),

        addObject: (object) =>
          set((state) => {
            // Track object creation with current tool
            trackObjectCreated(object.type, state.currentTool, {
              hasText: !!object.text,
              filled: object.filled,
            });
            const newObjects = [...state.objects, object];
            return {
              objects: newObjects,
              objectCount: newObjects.length,
              unsavedChanges: true,
              documentVersion: state.documentVersion + 1,
            };
          }),

        removeObject: (id) =>
          set((state) => {
            const newObjects = state.objects.filter((obj) => obj.id !== id);
            if (newObjects.length === state.objects.length) return state;
            return {
              objects: newObjects,
              objectCount: newObjects.length,
              selectedObjectId: state.selectedObjectId === id ? undefined : state.selectedObjectId,
              unsavedChanges: true,
              documentVersion: state.documentVersion + 1,
            };
          }),

        clearCanvas: () => {
          const state = get();
          trackFeatureUsage('clear_canvas', { objectCount: state.objects.length });
          // Save current state to history before clearing
          state.saveHistory();
          // Clear objects and request full redraw
          set((currentState) => ({
            objects: [],
            objectCount: 0,
            selectedObjectId: undefined,
            unsavedChanges: true,
            documentVersion: currentState.documentVersion + 1,
            needsFullRedraw: true,
          }));
        },

        setConnectionStatus: (connected) => set({ isConnected: connected }),
        toggleToolbar: () => set((state) => ({ showToolbar: !state.showToolbar })),
        setViewMode: (mode) => set({ viewMode: mode }),
        setShapeFilled: (filled) => set({ shapeFilled: filled }),
        setTriangleMode: (mode) => set({ triangleMode: mode }),
        setStarPoints: (points) => set({ starPoints: points }),
        setAutoShape: (enabled) => set({ autoShape: enabled }),
        setAutoShapeThresholds: (t) =>
          set((s) => ({ autoShapeThresholds: { ...s.autoShapeThresholds, ...t } })),

        updatePerformanceStats: (fps) => set({ fps }),

        // History actions
        saveHistory: () =>
          set((state) => {
            const newHistory = state.history.slice(0, state.historyIndex + 1);
            newHistory.push([...state.objects]);

            // Limit history size
            if (newHistory.length > state.maxHistorySize) {
              newHistory.shift();
            } else {
              return {
                history: newHistory,
                historyIndex: newHistory.length - 1,
              };
            }

            return {
              history: newHistory,
              historyIndex: newHistory.length - 1,
            };
          }),

        undo: () =>
          set((state) => {
            if (state.historyIndex > 0) {
              trackFeatureUsage('undo', { historyIndex: state.historyIndex });
              const newIndex = state.historyIndex - 1;
              const objects = [...state.history[newIndex]];
              return {
                historyIndex: newIndex,
                objects,
                objectCount: objects.length,
                unsavedChanges: true,
                documentVersion: state.documentVersion + 1,
                needsFullRedraw: true,
              };
            }
            return state;
          }),

        redo: () =>
          set((state) => {
            if (state.historyIndex < state.history.length - 1) {
              trackFeatureUsage('redo', { historyIndex: state.historyIndex });
              const newIndex = state.historyIndex + 1;
              const objects = [...state.history[newIndex]];
              return {
                historyIndex: newIndex,
                objects,
                objectCount: objects.length,
                unsavedChanges: true,
                documentVersion: state.documentVersion + 1,
                needsFullRedraw: true,
              };
            }
            return state;
          }),

        canUndo: () => get().historyIndex > 0,
        canRedo: () => get().historyIndex < get().history.length - 1,

        // Color management
        addCustomColor: (color) =>
          set((state) => {
            if (!state.customColors.includes(color)) {
              return { customColors: [...state.customColors, color] };
            }
            return state;
          }),

        removeCustomColor: (color) =>
          set((state) => ({
            customColors: state.customColors.filter((c) => c !== color),
          })),

        // View actions
        setZoom: (zoom) => set({ zoom: Math.max(0.1, Math.min(5, zoom)) }),
        setView: (x, y) => set({ viewX: x, viewY: y }),
        // Reset centers the view in the middle of the world canvas
        resetView: () => {
          // Default center position - will be adjusted by canvas on mount
          const centerX = 2048 - 500; // Approximate center
          const centerY = 2048 - 300;
          set({ zoom: 1, viewX: centerX, viewY: centerY });
        },
      }),
      {
        name: 'drawing-store',
        partialize: (state) => {
          const base = {
            customColors: state.customColors,
            brushSize: state.brushSize,
            brushColor: state.brushColor,
            brushOpacity: state.brushOpacity,
            currentTool: state.currentTool,
            eraserMode: state.eraserMode,
            projectTitle: state.projectTitle,
            shapeFilled: state.shapeFilled,
          };

          // Only persist autoShape settings if feature is enabled
          if (FEATURES.AUTO_SHAPE) {
            return {
              ...base,
              autoShape: state.autoShape,
              autoShapeThresholds: state.autoShapeThresholds,
            };
          }

          return base;
        },
      },
    ),
    { name: 'drawing-store' },
  ),
);
