import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { generateId } from '../lib/utils';
import { drawingStorePersistOptions } from './drawingStorePersist';
import type { DrawingState, ProjectBookmark } from './drawingStoreTypes';

export type {
  DrawingObject,
  SaveStatus,
  Tool,
  StrokeData,
  DrawingState,
} from './drawingStoreTypes';


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
        bookmarks: [],
        brushSize: 4,
        textFontSize: 24,
        brushColor: '#ffffff',
        brushOpacity: 1,
        penSize: 4,
        penColor: '#ffffff',
        penOpacity: 1,
        highlighterSize: 18,
        highlighterColor: '#facc15',
        highlighterOpacity: 0.35,
        selectedObjectId: undefined,
        selectedObjectIds: [],

        isConnected: false,
        showToolbar: true,
        viewMode: 'draw',
        drawingFilled: false,
        triangleMode: 'custom',
        starPoints: 5,
        // Keep freehand drawing predictable until the person explicitly opts in.
        autoDrawing: false,
        inputMode: 'auto',
        fingerAction: 'pan',
        sessionStylusSuppression: false,
        autoDrawingThresholds: {
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
          triangleError: 0.2,
          circleRoundnessTolerance: 0.2,
          minConfidence: 0.6,
          symmetryWeight: 0.3,
        },

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
          set((state) => {
            const leavingHighlighter = previousTool === 'highlighter' && tool !== 'highlighter';
            const enteringHighlighter = previousTool !== 'highlighter' && tool === 'highlighter';
            const penSettings = leavingHighlighter
              ? {
                  penSize: state.penSize,
                  penColor: state.penColor,
                  penOpacity: state.penOpacity,
                }
              : {};
            if (enteringHighlighter) {
              return {
                currentTool: tool,
                brushSize: state.highlighterSize,
                brushColor: state.highlighterColor,
                brushOpacity: state.highlighterOpacity,
              };
            }
            if (leavingHighlighter) {
              return {
                ...penSettings,
                currentTool: tool,
                brushSize: state.penSize,
                brushColor: state.penColor,
                brushOpacity: state.penOpacity,
              };
            }
            return { currentTool: tool };
          });
        },
        setEraserMode: (mode) => set({ eraserMode: mode }),
        setObjects: (objects) =>
          set((state) => ({
            objects,
            objectCount: objects.length,
            selectedObjectId: objects.some((object) => object.id === state.selectedObjectId)
              ? state.selectedObjectId
              : undefined,
            selectedObjectIds: state.selectedObjectIds.filter((id) =>
              objects.some((object) => object.id === id),
            ),
            unsavedChanges: true,
            documentVersion: state.documentVersion + 1,
          })),
        applyAuthoritativeProject: ({ objects, title, revision, bookmarks }) => {
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
              bookmarks: bookmarks ?? state.bookmarks,
              projectRevision: revision,
              unsavedChanges: false,
              documentVersion: state.documentVersion + 1,
              saveStatus: 'saved',
              needsFullRedraw: true,
            };
          });
          return applied;
        },
        hydrateProject: ({ id, objects, title, revision, role, bookmarks }) =>
          set((state) => ({
            currentProjectId: id,
            projectTitle: title,
            projectRevision: revision,
            projectRole: role,
            bookmarks: bookmarks ?? [],
            objects,
            objectCount: objects.length,
            selectedObjectId: undefined,
            selectedObjectIds: [],
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
            selectedObjectIds: [],
            history: [[]],
            historyIndex: 0,
            projectTitle: 'Untitled',
            unsavedChanges: false,
            documentVersion: state.documentVersion + 1,
            needsFullRedraw: true,
            currentProjectId: undefined,
            bookmarks: [],
            projectRevision: undefined,
            projectRole: 'owner',
          }));
          localStorage.removeItem('lastProjectId');
        },
        setCurrentProject: (id) =>
          set((state) => {
            if (state.currentProjectId === id) return { currentProjectId: id };
            return {
              currentProjectId: id,
              projectRevision: undefined,
              documentVersion: state.documentVersion + 1,
            };
          }),
        setProjectRevision: (revision) => set({ projectRevision: revision }),
        setBrushSize: (size) =>
          set((state) => {
            const nextSize = Math.max(1, Math.min(100, size));
            return state.currentTool === 'highlighter'
              ? { brushSize: nextSize, highlighterSize: nextSize }
              : { brushSize: nextSize, penSize: nextSize };
          }),
        setTextFontSize: (size) =>
          set({ textFontSize: Math.max(12, Math.min(240, Math.round(size))) }),
        setBrushColor: (color) =>
          set((state) =>
            state.currentTool === 'highlighter'
              ? { brushColor: color, highlighterColor: color }
              : { brushColor: color, penColor: color },
          ),
        setBrushOpacity: (opacity) =>
          set((state) => {
            const nextOpacity = Math.max(0.1, Math.min(1, opacity));
            return state.currentTool === 'highlighter'
              ? { brushOpacity: nextOpacity, highlighterOpacity: nextOpacity }
              : { brushOpacity: nextOpacity, penOpacity: nextOpacity };
          }),
        setSelectedObject: (id) => set({ selectedObjectId: id, selectedObjectIds: id ? [id] : [] }),
        setSelectedObjects: (ids) =>
          set({ selectedObjectId: ids[0], selectedObjectIds: [...new Set(ids)] }),
        toggleSelectedObject: (id) =>
          set((state) => {
            const selectedObjectIds = state.selectedObjectIds.includes(id)
              ? state.selectedObjectIds.filter((candidate) => candidate !== id)
              : [...state.selectedObjectIds, id];
            return { selectedObjectIds, selectedObjectId: selectedObjectIds[0] };
          }),
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
              selectedObjectIds: state.selectedObjectIds.filter((candidate) => candidate !== id),
              unsavedChanges: true,
              documentVersion: state.documentVersion + 1,
            };
          }),

        clearCanvas: () => {
          const state = get();
          state.saveHistory();
          // Clear objects and request full redraw
          set((currentState) => ({
            objects: [],
            objectCount: 0,
            selectedObjectId: undefined,
            selectedObjectIds: [],
            unsavedChanges: true,
            documentVersion: currentState.documentVersion + 1,
            needsFullRedraw: true,
          }));
        },

        setConnectionStatus: (connected) => set({ isConnected: connected }),
        toggleToolbar: () => set((state) => ({ showToolbar: !state.showToolbar })),
        setViewMode: (mode) => set({ viewMode: mode }),
        setDrawingFilled: (filled) => set({ drawingFilled: filled }),
        setTriangleMode: (mode) => set({ triangleMode: mode }),
        setStarPoints: (points) => set({ starPoints: points }),
        setAutoDrawing: (enabled) => set({ autoDrawing: enabled }),
        setInputMode: (inputMode) => set({ inputMode }),
        setFingerAction: (fingerAction) => set({ fingerAction }),
        setSessionStylusSuppression: (sessionStylusSuppression) =>
          set({ sessionStylusSuppression }),
        setAutoDrawingThresholds: (t) =>
          set((s) => ({ autoDrawingThresholds: { ...s.autoDrawingThresholds, ...t } })),

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
        createBookmark: (name) => {
          const state = get();
          const requestedName = name?.trim().slice(0, 100);
          const bookmark: ProjectBookmark = {
            id: generateId(),
            name: requestedName || `Bookmark ${state.bookmarks.length + 1}`,
            x: state.viewX,
            y: state.viewY,
            zoom: state.zoom,
          };
          set((current) => ({
            bookmarks: [...current.bookmarks, bookmark],
            unsavedChanges: true,
            documentVersion: current.documentVersion + 1,
          }));
          return bookmark;
        },
        addBookmark: (name) => get().createBookmark(name),
        renameBookmark: (id, name) => {
          const nextName = name.trim();
          if (!nextName) return false;
          let changed = false;
          set((state) => {
            if (!state.bookmarks.some((bookmark) => bookmark.id === id)) return state;
            changed = true;
            return {
              bookmarks: state.bookmarks.map((bookmark) =>
                bookmark.id === id ? { ...bookmark, name: nextName.slice(0, 100) } : bookmark,
              ),
              unsavedChanges: true,
              documentVersion: state.documentVersion + 1,
            };
          });
          return changed;
        },
        updateBookmark: (id, name) => get().renameBookmark(id, name),
        deleteBookmark: (id) => {
          let changed = false;
          set((state) => {
            const bookmarks = state.bookmarks.filter((bookmark) => bookmark.id !== id);
            if (bookmarks.length === state.bookmarks.length) return state;
            changed = true;
            return {
              bookmarks,
              unsavedChanges: true,
              documentVersion: state.documentVersion + 1,
            };
          });
          return changed;
        },
        removeBookmark: (id) => get().deleteBookmark(id),
        restoreBookmark: (id) => {
          const bookmark = get().bookmarks.find((candidate) => candidate.id === id);
          if (!bookmark) return false;
          set({ zoom: bookmark.zoom, viewX: bookmark.x, viewY: bookmark.y });
          return true;
        },
        jumpToBookmark: (id) => get().restoreBookmark(id),
        setBookmarks: (bookmarks) =>
          set((state) => ({
            bookmarks,
            unsavedChanges: true,
            documentVersion: state.documentVersion + 1,
          })),
      }),
      // SAFETY: Zustand's persist generic is invariant in the stored slice; the
      // migrate function returns the same partial shape partialize writes.
      drawingStorePersistOptions as never,
    ),
    { name: 'drawing-store' },
  ),
);
