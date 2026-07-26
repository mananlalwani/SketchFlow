import { useRef, useEffect, useCallback, useState } from 'react';
import { useGesture } from '@use-gesture/react';
import { useDrawingStore } from '@/store/drawingStore';
import { useDrawingSocket } from '@/hooks/useSocket';
import { usePerformanceMonitor } from '@/hooks/usePerformanceMonitor';
import { useFPSCounter } from '@/hooks/useFPSCounter';
import { useTheme } from '@/contexts/ThemeContext';
import { Button } from './ui/button';
import { Square, Circle, Triangle, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

import { generateId } from '@/lib/utils';
import type { DrawingObject } from '@/store/drawingStore';
import type { StrokeData, ShapeData } from '@/types/socket';
import { detectShapes } from '@/lib/shapeDetectors';
import { ShortcutsDialog } from './ShortcutsDialog';
import { LiveCursors } from './LiveCursors';
import { useLiveCursors } from '@/hooks/useLiveCursors';
import { useLiveSelections } from '@/hooks/useLiveSelections';
import { useProjectPermissions } from '@/hooks/useProjectPermissions';
import { useCanvasRendererWorker } from '@/hooks/useCanvasRendererWorker';
import { useCanvasRendererFallback } from '@/hooks/useCanvasRendererFallback';
import { useCanvasToolReset } from '@/hooks/useCanvasToolReset';
import { useCanvasKeyboardShortcuts } from '@/hooks/useCanvasKeyboardShortcuts';
import {
  getAuthoritativeObjects,
  useCanvasCollaborationAdapter,
} from '@/hooks/useCanvasCollaborationAdapter';
import { useCanvasImageInput } from '@/hooks/useCanvasImageInput';
import { findCanvasObjectIdAt } from '@/lib/canvasSelection';
import {
  buildStrokePoints,
  constrainShapeEnd,
  getPointerSamples,
  screenPointToWorld,
} from '@/lib/canvasPointer';
import {
  getObjectDragOffset,
  expandObjectIdsWithGroups,
  translateObjectInCollection,
  translateObjectsBy,
} from '@/lib/canvasObjectTransform';
import { postRendererViewport } from '@/lib/canvasRendererViewport';
import { drawingObjectsToRendererScene } from '@/lib/canvasRendererObject';
import { useToast } from '@/hooks/use-toast';
import { FEATURES } from '@/config/features';
import { captureOperationalSignal } from '@/lib/sentry';
import {
  enqueueCollaborationOperation,
  getCollaborationOperations,
  markCollaborationOperationAttempt,
  removeCollaborationOperation,
} from '@/lib/offlineQueue';
import {
  calculateTriangleVertices,
  panViewportBy,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  zoomViewportAtPoint,
} from '@/lib/canvasViewport';

const BG_COLORS = {
  dark: '#0a0a0a',
  light: '#e0e0e0',
} as const;

function pressureAdjustedSize(baseSize: number, event: PointerEvent): number {
  // Mouse/touch report a synthetic pressure of 0 or 0.5; only a pen should
  // alter the selected brush width. Preserve a usable minimum at light touch.
  if (event.pointerType !== 'pen' || event.pressure <= 0) return baseSize;
  return baseSize * (0.25 + event.pressure * 0.75);
}

function committedStrokeSize(strokes: StrokeData[], fallback: number): number {
  if (strokes.length === 0) return fallback;
  return strokes.reduce((sum, stroke) => sum + stroke.size, 0) / strokes.length;
}

function getObjectBounds(object: DrawingObject) {
  if (object.type === 'stroke' && object.points?.length) {
    const xs = object.points.map((point) => point.x);
    const ys = object.points.map((point) => point.y);
    return {
      x: Math.min(...xs) - object.size,
      y: Math.min(...ys) - object.size,
      width: Math.max(...xs) - Math.min(...xs) + object.size * 2,
      height: Math.max(...ys) - Math.min(...ys) + object.size * 2,
    };
  }
  if (
    object.x === undefined ||
    object.y === undefined ||
    object.width === undefined ||
    object.height === undefined
  )
    return null;
  if (object.type === 'text') {
    return {
      x: object.x,
      // Text is rendered with a top baseline, so its selection outline must
      // start at the same anchor rather than treating `y` as its midpoint.
      y: object.y,
      width: object.width,
      height: object.height,
    };
  }
  return {
    x: Math.min(object.x, object.x + object.width),
    y: Math.min(object.y, object.y + object.height),
    width: Math.abs(object.width),
    height: Math.abs(object.height),
  };
}

type TransformHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'rotate';

interface ActiveTransform {
  handle: TransformHandle;
  object: DrawingObject;
  preserveAspectRatio: boolean;
}

interface ActiveDrag {
  id: string;
  ids: string[];
  offsetX: number;
  offsetY: number;
}

function pointInObjectSpace(point: { x: number; y: number }, object: DrawingObject) {
  const x = object.x ?? 0;
  const y = object.y ?? 0;
  const width = object.width ?? 0;
  const height = object.height ?? 0;
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const radians = -((object.rotation ?? 0) * Math.PI) / 180;
  const deltaX = point.x - centerX;
  const deltaY = point.y - centerY;
  return {
    x: centerX + deltaX * Math.cos(radians) - deltaY * Math.sin(radians),
    y: centerY + deltaX * Math.sin(radians) + deltaY * Math.cos(radians),
  };
}

export function DrawingCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const {
    currentTool,
    eraserMode,
    brushSize,
    textFontSize,
    setTextFontSize,
    brushColor,
    brushOpacity,
    triangleMode,
    starPoints,
    zoom,
    viewX,
    viewY,
    objects,
    needsFullRedraw,
    clearFullRedraw,
    requestFullRedraw,
    addObject,
    removeObject,
    setObjects,
    applyAuthoritativeProject,
    replaceHistory,
    saveHistory,
    updatePerformanceStats,
    currentProjectId,
    projectRevision,
    projectTitle,
    documentVersion,
    unsavedChanges,
    setProjectRevision,
    markSaved,
    setSaveStatus,
    setZoom,
    setView,
    resetView,
    autoShape,
    objectCount,
    selectedObjectId,
    setSelectedObject,
    selectedObjectIds,
    setSelectedObjects,
    updateObject,
    projectRole,
  } = useDrawingStore();

  const [dragPreviewObject, setDragPreviewObject] = useState<DrawingObject | null>(null);
  const [dragPreviewObjects, setDragPreviewObjects] = useState<DrawingObject[] | null>(null);
  const selectedObject = objects.find((object) => object.id === selectedObjectId);
  const selectedObjects = objects.filter((object) => selectedObjectIds.includes(object.id));
  const displayedSelectedObjects = dragPreviewObjects ?? selectedObjects;
  const multiSelectionBounds =
    displayedSelectedObjects.length > 1
      ? displayedSelectedObjects
          .map(getObjectBounds)
          .filter((bounds): bounds is NonNullable<typeof bounds> => bounds !== null)
          .reduce<NonNullable<ReturnType<typeof getObjectBounds>> | null>((combined, bounds) => {
            if (!combined) return bounds;
            const right = Math.max(combined.x + combined.width, bounds.x + bounds.width);
            const bottom = Math.max(combined.y + combined.height, bounds.y + bounds.height);
            return {
              x: Math.min(combined.x, bounds.x),
              y: Math.min(combined.y, bounds.y),
              width: right - Math.min(combined.x, bounds.x),
              height: bottom - Math.min(combined.y, bounds.y),
            };
          }, null)
      : null;
  const selectedDisplayObject =
    dragPreviewObjects?.find((object) => object.id === selectedObject?.id) ??
    (dragPreviewObject?.id === selectedObject?.id ? dragPreviewObject : selectedObject);
  const selectedBounds = selectedDisplayObject ? getObjectBounds(selectedDisplayObject) : null;
  const selectedRotation = selectedDisplayObject?.rotation ?? 0;
  const canDirectTransform = Boolean(
    selectedObject &&
      selectedObjectIds.length === 1 &&
      !selectedObject.locked &&
      projectRole !== 'viewer' &&
      selectedObject.type !== 'stroke' &&
      selectedObject.type !== 'text' &&
      !selectedObject.points?.length &&
      selectedObject.x !== undefined &&
      selectedObject.y !== undefined &&
      selectedObject.width !== undefined &&
      selectedObject.height !== undefined,
  );

  const { requestCanonicalHydration, commitCollaboration, isConnected, on } = useDrawingSocket();
  const { cursors, emitCursor } = useLiveCursors(currentProjectId ?? null);
  const { remoteSelections } = useLiveSelections(currentProjectId ?? null, selectedObjectIds);
  const { canDraw } = useProjectPermissions();
  const { toast } = useToast();
  const deleteSelectedObjects = useCallback(() => {
    if (projectRole === 'viewer' || selectedObjectIds.length < 2) return;
    const selectedIds = new Set(selectedObjectIds);
    const lockedCount = objects.filter(
      (object) => selectedIds.has(object.id) && object.locked,
    ).length;
    if (lockedCount > 0) {
      toast({
        title: 'Unlock selected objects first',
        description: 'Locked objects cannot be deleted as part of a selection.',
        variant: 'destructive',
      });
      return;
    }
    saveHistory();
    setObjects(objects.filter((object) => !selectedIds.has(object.id)));
    setSelectedObject(undefined);
    requestFullRedraw();
  }, [
    objects,
    projectRole,
    requestFullRedraw,
    saveHistory,
    selectedObjectIds,
    setObjects,
    setSelectedObject,
    toast,
  ]);
  const { updateMetrics, shouldSkipFrame } = usePerformanceMonitor();
  const fps = useFPSCounter();
  const { theme } = useTheme();

  const [isDrawing, setIsDrawing] = useState(false);
  const [lastPoint, setLastPoint] = useState<{ x: number; y: number } | null>(null);
  const [currentStroke, setCurrentStroke] = useState<StrokeData[]>([]);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [previewShape, setPreviewShape] = useState<{
    type: string;
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    color: string;
    size: number;
    alpha: number;
  } | null>(null);
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const [isConstraintMode, setIsConstraintMode] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{
    x: number;
    y: number;
    viewX: number;
    viewY: number;
  } | null>(null);
  const [isSpacePan, setIsSpacePan] = useState(false);
  const [triangleVertices, setTriangleVertices] = useState<{ x: number; y: number }[]>([]);
  const [textInputPos, setTextInputPos] = useState<{
    x: number;
    y: number;
    worldX: number;
    worldY: number;
  } | null>(null);
  const textInputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [textInputValue, setTextInputValue] = useState('');
  const [draggedObject, setDraggedObject] = useState<ActiveDrag | null>(null);
  const [selectionRect, setSelectionRect] = useState<{
    startX: number;
    startY: number;
    endX: number;
    endY: number;
  } | null>(null);
  const [activeTransform, setActiveTransform] = useState<ActiveTransform | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const draggedObjectsRef = useRef<DrawingObject[] | null>(null);
  const activeDragRef = useRef<ActiveDrag | null>(null);
  const dragRedrawScheduledRef = useRef(false);
  const panViewportScheduledRef = useRef(false);
  const currentPanViewRef = useRef<{ x: number; y: number } | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const rendererStatus = useCanvasRendererWorker(
    canvasRef,
    workerRef,
    { zoom, viewX, viewY },
    theme,
  );
  useCanvasRendererFallback(
    canvasRef,
    rendererStatus === 'fallback',
    objects,
    { zoom, viewX, viewY },
    BG_COLORS[theme],
  );
  const workerStrokeQueueRef = useRef<StrokeData[]>([]);
  const workerFlushScheduledRef = useRef(false);
  const strokeGroupRef = useRef<string | null>(null);
  const collaborationCommitInFlightRef = useRef(false);
  const collaborationReplayInFlightRef = useRef(false);
  const collaborationObjectsRef = useRef<DrawingObject[]>([]);
  const collaborationProjectRef = useRef<string | undefined>(undefined);

  // Canvas mutations are sent as object operations. Distinct objects can be
  // committed from two devices (including two sessions of the same account)
  // without one full-board snapshot replacing the other.
  useEffect(() => {
    if (
      collaborationProjectRef.current !== currentProjectId ||
      !unsavedChanges ||
      !currentProjectId
    ) {
      collaborationProjectRef.current = currentProjectId;
      collaborationObjectsRef.current = objects;
      return;
    }
    if (
      !canDraw ||
      !isConnected ||
      !unsavedChanges ||
      projectRevision === undefined ||
      collaborationCommitInFlightRef.current ||
      draggedObject ||
      activeTransform
    ) {
      return;
    }

    const projectId = currentProjectId;
    const previous = collaborationObjectsRef.current;
    const previousById = new Map(previous.map((object) => [object.id, object]));
    const currentById = new Map(objects.map((object) => [object.id, object]));
    const changed = objects.filter(
      (object) => JSON.stringify(previousById.get(object.id)) !== JSON.stringify(object),
    );
    const removed = previous.filter((object) => !currentById.has(object.id));
    const changes = [
      ...changed.map((object) => ({ kind: 'upsert-object' as const, data: { object } })),
      ...removed.map((object) => ({ kind: 'delete-object' as const, data: { id: object.id } })),
    ];
    if (changes.length === 0) {
      collaborationObjectsRef.current = objects;
      return;
    }
    // A batch is atomic at the server and avoids the old full-document fallback
    // for undo/redo and other compound canvas mutations.
    const operation =
      changes.length === 1 ? changes[0] : { kind: 'batch' as const, data: { operations: changes } };
    const committedDocumentVersion = documentVersion;
    collaborationCommitInFlightRef.current = true;
    collaborationObjectsRef.current = objects;
    setSaveStatus('syncing');
    const operationId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `operation-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;

    const commit = {
      protocolVersion: 1 as const,
      projectId,
      operationId,
      expectedRevision: projectRevision,
      kind: operation.kind,
      data: operation.data,
      title: projectTitle,
    };
    // IndexedDB is the source of truth for unsent edits: a tab close or
    // transient socket failure cannot turn an optimistic edit into data loss.
    void enqueueCollaborationOperation({ ...commit, createdAt: Date.now() })
      .then(() =>
        commitCollaboration(commit, (result) => {
          collaborationCommitInFlightRef.current = false;
          const state = useDrawingStore.getState();
          if (state.currentProjectId !== projectId) return;

          if (result.status === 'applied' || result.status === 'duplicate') {
            void removeCollaborationOperation(operationId);
            // The server may have rebased this object operation over an edit that
            // arrived from another device. Adopt that canonical result when this
            // is still the exact local edit we acknowledged.
            const canonicalObjects =
              result.status === 'applied' ? getAuthoritativeObjects(result.data) : null;
            if (canonicalObjects && state.documentVersion === committedDocumentVersion) {
              state.setObjects(canonicalObjects);
              state.setProjectRevision(result.revision);
              state.markSaved(useDrawingStore.getState().documentVersion);
              return;
            }
            state.setProjectRevision(result.revision);
            state.markSaved(committedDocumentVersion);
            return;
          }

          if (result.status === 'conflict') {
            captureOperationalSignal('collaboration_replay_conflict', { replay: false });
            void markCollaborationOperationAttempt(operationId);
            state.setSaveStatus('conflict');
            requestCanonicalHydration(projectId);
            return;
          }

          state.setSaveStatus(result.status === 'unavailable' ? 'retrying' : 'failed');
          captureOperationalSignal('collaboration_queue_failed', {
            unavailable: result.status === 'unavailable',
          });
          void markCollaborationOperationAttempt(operationId);
        }),
      )
      .catch(() => {
        collaborationCommitInFlightRef.current = false;
        captureOperationalSignal('collaboration_queue_failed', { durableWrite: true });
        useDrawingStore.getState().setSaveStatus('failed');
      });
  }, [
    canDraw,
    commitCollaboration,
    currentProjectId,
    documentVersion,
    isConnected,
    objects,
    projectRevision,
    projectTitle,
    requestCanonicalHydration,
    setProjectRevision,
    markSaved,
    setSaveStatus,
    unsavedChanges,
    draggedObject,
    activeTransform,
  ]);

  // Replay persisted semantic edits after a reconnect or browser restart. Object
  // operations can safely use their original base revision because the server
  // rebases them over unrelated object changes and deduplicates operation IDs.
  useEffect(() => {
    if (!currentProjectId || !isConnected || !canDraw || collaborationReplayInFlightRef.current)
      return;
    let cancelled = false;
    collaborationReplayInFlightRef.current = true;
    void (async () => {
      const queued = await getCollaborationOperations(currentProjectId);
      for (const operation of queued) {
        if (cancelled || !isConnected) break;
        await new Promise<void>((resolve) => {
          commitCollaboration({ protocolVersion: 1, ...operation }, (result) => {
            if (result.status === 'applied' || result.status === 'duplicate') {
              void removeCollaborationOperation(operation.operationId);
              useDrawingStore.getState().setProjectRevision(result.revision);
            } else {
              void markCollaborationOperationAttempt(operation.operationId);
              if (result.status === 'conflict') {
                captureOperationalSignal('collaboration_replay_conflict', { replay: true });
                requestCanonicalHydration(currentProjectId);
              }
            }
            resolve();
          });
        });
      }
    })()
      .catch(() => undefined)
      .finally(() => {
        collaborationReplayInFlightRef.current = false;
      });
    return () => {
      cancelled = true;
    };
  }, [canDraw, commitCollaboration, currentProjectId, isConnected, requestCanonicalHydration]);

  useEffect(() => {
    if (!needsFullRedraw) return;
    const scene = drawingObjectsToRendererScene(objects);
    workerRef.current?.postMessage({
      type: 'load-scene',
      requestId: `scene-${currentProjectId ?? 'local'}-${objects.length}`,
      ...scene,
    });
    clearFullRedraw();
  }, [needsFullRedraw, clearFullRedraw, currentProjectId, objects]);

  const initializedRef = useRef(false);
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const centerViewX = WORLD_WIDTH / 2 - rect.width / 2;
    const centerViewY = WORLD_HEIGHT / 2 - rect.height / 2;
    setView(centerViewX, centerViewY);
  }, [setView]);

  const render = useCallback(() => {
    const frameStart = performance.now();
    if (shouldSkipFrame) return;
    const frameEnd = performance.now();
    updateMetrics(frameStart, frameEnd);
    updatePerformanceStats(fps);
  }, [shouldSkipFrame, updateMetrics, fps, updatePerformanceStats]);

  const flushWorkerStrokes = useCallback(() => {
    const worker = workerRef.current;
    if (!worker) {
      workerStrokeQueueRef.current = [];
      workerFlushScheduledRef.current = false;
      return;
    }
    const batch = workerStrokeQueueRef.current;
    if (batch.length) {
      worker.postMessage({ type: 'strokes', data: batch });
      workerStrokeQueueRef.current = [];
    }
    workerFlushScheduledRef.current = false;
  }, []);

  const enqueueWorkerStroke = useCallback(
    (stroke: StrokeData) => {
      workerStrokeQueueRef.current.push(stroke);
      if (!workerFlushScheduledRef.current) {
        workerFlushScheduledRef.current = true;
        requestAnimationFrame(() => flushWorkerStrokes());
      }
    },
    [flushWorkerStrokes],
  );

  useEffect(() => {
    let animationId: number;
    let lastFrameTime = 0;
    const targetFPS = 60;
    const frameInterval = 1000 / targetFPS;

    const animate = (currentTime: number) => {
      if (currentTime - lastFrameTime >= frameInterval) {
        render();
        lastFrameTime = currentTime;
      }
      animationId = requestAnimationFrame(animate);
    };

    animationId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationId);
  }, [render]);

  const startSpacePan = useCallback(() => setIsSpacePan(true), []);
  const endSpacePan = useCallback(() => {
    setIsSpacePan(false);
    setIsPanning(false);
    setPanStart(null);
  }, []);

  useCanvasKeyboardShortcuts({
    canvasRef,
    workerRef,
    setIsShiftPressed,
    onSpacePanStart: startSpacePan,
    onSpacePanEnd: endSpacePan,
    setShowShortcuts,
  });

  const handleImageUpload = useCanvasImageInput({
    canvasRef,
    viewX,
    viewY,
    zoom,
    textInputActive: Boolean(textInputPos),
    addObject,
    saveHistory,
  });

  const clearConstraintMode = useCallback(() => setIsConstraintMode(false), []);
  const clearTriangleVertices = useCallback(() => setTriangleVertices([]), []);
  const clearTextInput = useCallback(() => {
    setTextInputPos(null);
    setTextInputValue('');
  }, []);

  const submitTextInput = useCallback(() => {
    if (!textInputPos || !textInputValue.trim()) return;

    const text = textInputValue.trim();
    const fontSize = textFontSize;
    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) return;
    ctx.font = `${fontSize}px Inter, system-ui, sans-serif`;

    const lines = text.split('\n');
    const maxWidth = Math.max(...lines.map((line) => ctx.measureText(line).width));
    const height = fontSize * lines.length * 1.4;
    const textObject = {
      id: generateId(),
      type: 'text' as const,
      x: textInputPos.worldX,
      y: textInputPos.worldY,
      text,
      fontSize,
      color: brushColor,
      size: brushSize,
      alpha: brushOpacity,
      width: maxWidth,
      height,
    };

    saveHistory();
    addObject(textObject);
    workerRef.current?.postMessage({
      type: 'shape',
      data: { ...textObject, timestamp: Date.now() },
    });
    clearTextInput();
  }, [
    addObject,
    brushColor,
    brushOpacity,
    brushSize,
    textFontSize,
    clearTextInput,
    saveHistory,
    textInputPos,
    textInputValue,
  ]);

  useCanvasToolReset({
    currentTool,
    clearConstraintMode,
    clearTriangleVertices,
    clearTextInput,
  });

  useCanvasCollaborationAdapter({
    on,
    isConnected,
    currentProjectId,
    projectRevision,
    requestCanonicalHydration,
    applyAuthoritativeProject,
    replaceHistory,
    requestFullRedraw,
  });

  const detectShapeFromStroke = useCallback(
    (
      points: { x: number; y: number }[],
    ):
      | {
          kind: 'rectangle' | 'ellipse' | 'circle' | 'triangle' | 'line';
          x: number;
          y: number;
          width: number;
          height: number;
          /** Preserve fitted triangle vertices instead of redrawing a preset triangle. */
          points?: { x: number; y: number }[];
        }
      | {
          kind: 'parabola';
          x: number;
          y: number;
          width: number;
          height: number;
          orientation: 'up' | 'down' | 'left' | 'right';
        }
      | null => {
      if (!points || points.length < 3) return null;

      const oldThresholds = useDrawingStore.getState().autoShapeThresholds;

      try {
        const result = detectShapes(points, {
          // Shape recognition is intentionally silent during drawing. The pipeline
          // returns a candidate only when it clears its confidence threshold.
          debugMode: false,
          thresholds: {
            minConfidence: 0.5,
            maxError: 0.3,
            lineMaxError: 0.1,
            lineMinLength: oldThresholds.minSizePx,
            rectangleMaxError: 0.3,
            rectangleEdgeRatio: 0.6,
            ellipseMaxError: 0.35,
            circleRoundnessTolerance: 0.25,
            triangleMaxError: 0.35,
            triangleEdgeRatio: 0.5,
            parabolaMaxError: 0.3,
            parabolaMinCurvature: 0.05,
            parabolaSymmetryTolerance: 0.4,
            lineAngleTolerance: Math.PI / 12,
            rectangleCornerTolerance: Math.PI / 6,
            rectangleAspectRatioTolerance: 0.2,
            ellipseMinEccentricity: 0.05,
            triangleCornerTolerance: Math.PI / 4,
          },
          strokeProcessingOptions: {
            minSize: oldThresholds.minSizePx,
            resampleStep: oldThresholds.resampleStep,
            closureTolerance: oldThresholds.closureFactor,
            simplificationTolerance: 0.5,
            smoothingWindow: 3,
          },
        });

        if (result.detectedShape) {
          const shape = result.detectedShape.shape;
          const bbox = shape.boundingBox;

          if (shape.type === 'parabola' && shape.properties?.orientation) {
            return {
              kind: 'parabola' as const,
              x: bbox.minX,
              y: bbox.minY,
              width: bbox.width,
              height: bbox.height,
              orientation: shape.properties.orientation as 'up' | 'down' | 'left' | 'right',
            };
          } else {
            const shapeObj = {
              kind: shape.type as 'rectangle' | 'ellipse' | 'circle' | 'triangle' | 'line',
              x: bbox.minX,
              y: bbox.minY,
              width: bbox.width,
              height: bbox.height,
              // The renderer uses these three vertices for a custom triangle. Without
              // them every recognized triangle becomes the generic centered preset.
              ...(shape.type === 'triangle' && shape.points?.length === 3
                ? { points: shape.points.map(({ x, y }) => ({ x, y })) }
                : {}),
            };
            return shapeObj;
          }
        }
      } catch (error) {
        console.warn('Shape detection failed; leaving stroke unchanged:', error);
      }

      // An ambiguous mark should stay a freehand stroke. The former fallback
      // turned every closed path into a rectangle and every open path into a
      // line, which made triangles and rough sketches conflict with shapes.
      return null;
    },
    [],
  );

  const screenToWorld = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      return screenPointToWorld(
        canvas.getBoundingClientRect(),
        { zoom, viewX, viewY },
        clientX,
        clientY,
      );
    },
    [viewX, viewY, zoom],
  );

  useEffect(() => {
    if (!activeTransform) return;
    const { object, handle, preserveAspectRatio } = activeTransform;
    if (
      object.x === undefined ||
      object.y === undefined ||
      object.width === undefined ||
      object.height === undefined
    )
      return;
    const objectX = object.x;
    const objectY = object.y;
    const objectWidth = object.width;
    const objectHeight = object.height;

    const onMove = (event: PointerEvent) => {
      const worldPoint = screenToWorld(event.clientX, event.clientY);
      if (handle === 'rotate') {
        const centerX = objectX + objectWidth / 2;
        const centerY = objectY + objectHeight / 2;
        const rotation =
          ((Math.atan2(worldPoint.y - centerY, worldPoint.x - centerX) * 180) / Math.PI +
            90 +
            360) %
          360;
        updateObject(object.id, { rotation });
        return;
      }

      const point = pointInObjectSpace(worldPoint, object);
      const left = objectX;
      const top = objectY;
      const right = objectX + objectWidth;
      const bottom = objectY + objectHeight;
      let nextLeft = left;
      let nextTop = top;
      let nextRight = right;
      let nextBottom = bottom;
      if (handle.includes('w')) nextLeft = Math.min(point.x, right - 8);
      if (handle.includes('e')) nextRight = Math.max(point.x, left + 8);
      if (handle.includes('n')) nextTop = Math.min(point.y, bottom - 8);
      if (handle.includes('s')) nextBottom = Math.max(point.y, top + 8);

      let width = nextRight - nextLeft;
      let height = nextBottom - nextTop;
      if (preserveAspectRatio && !['n', 'e', 's', 'w'].includes(handle)) {
        const ratio = Math.abs(objectWidth / objectHeight) || 1;
        if (width / height > ratio) height = width / ratio;
        else width = height * ratio;
        if (handle.includes('w')) nextLeft = nextRight - width;
        else nextRight = nextLeft + width;
        if (handle.includes('n')) nextTop = nextBottom - height;
        else nextBottom = nextTop + height;
      }

      updateObject(object.id, {
        x: nextLeft,
        y: nextTop,
        width: nextRight - nextLeft,
        height: nextBottom - nextTop,
      });
    };
    const onUp = () => setActiveTransform(null);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [activeTransform, screenToWorld, updateObject]);

  const startTransform = (event: React.PointerEvent<SVGElement>, handle: TransformHandle) => {
    if (!selectedObject || selectedObject.locked || projectRole === 'viewer') return;
    event.preventDefault();
    event.stopPropagation();
    saveHistory();
    setActiveTransform({ handle, object: selectedObject, preserveAspectRatio: event.shiftKey });
  };

  const startDrawing = useCallback(
    (e: React.PointerEvent) => {
      if (!canDraw && currentTool !== 'hand' && currentTool !== 'select') {
        toast({
          title: 'View Only',
          description: "You don't have permission to edit this project.",
          variant: 'destructive',
        });
        return;
      }

      if (textInputPos) return;

      const worldPos = screenToWorld(e.clientX, e.clientY);
      try {
        (
          e.currentTarget as Element & {
            setPointerCapture?: (id: number) => void;
          }
        ).setPointerCapture?.(e.pointerId);
      } catch {
        // ignore
      }

      if (currentTool === 'select' || currentTool === 'move') {
        const hitId = findCanvasObjectIdAt(objects, worldPos.x, worldPos.y, {
          includeImages: true,
        });
        if (hitId) {
          const obj = objects.find((o) => o.id === hitId);
          if (obj) {
            if (e.shiftKey) {
              const groupMemberIds = expandObjectIdsWithGroups(objects, [hitId]);
              const groupIsSelected = groupMemberIds.every((id) => selectedObjectIds.includes(id));
              setSelectedObjects(
                groupIsSelected
                  ? selectedObjectIds.filter((id) => !groupMemberIds.includes(id))
                  : [...selectedObjectIds, ...groupMemberIds],
              );
              return;
            }
            const groupIds = obj.groupId
              ? objects
                  .filter((candidate) => candidate.groupId === obj.groupId)
                  .map((candidate) => candidate.id)
              : [hitId];
            const ids = expandObjectIdsWithGroups(
              objects,
              selectedObjectIds.includes(hitId) ? selectedObjectIds : groupIds,
            );
            if (!selectedObjectIds.includes(hitId) || ids.length !== selectedObjectIds.length) {
              setSelectedObjects(ids);
            }
            if (e.pointerType === 'touch' && 'vibrate' in navigator) navigator.vibrate(12);
            // Selection is intentionally non-destructive. It can activate
            // resize/rotate handles, but only the Move tool starts a drag.
            if (currentTool === 'select') {
              setIsDrawing(true);
              return;
            }
            if (obj.locked) return;
            // Locked objects remain selected so their state is clear, but never
            // join a transform started from an unlocked group member.
            const movableIds = ids.filter(
              (id) => !objects.find((candidate) => candidate.id === id)?.locked,
            );
            if (!movableIds.length) return;
            const offset = getObjectDragOffset(obj, worldPos);
            const drag = { id: hitId, ids: movableIds, offsetX: offset.x, offsetY: offset.y };
            activeDragRef.current = drag;
            setDragPreviewObject(obj);
            setDragPreviewObjects(objects.filter((candidate) => movableIds.includes(candidate.id)));
            setDraggedObject(drag);
            saveHistory();
            return;
          }
        }
        if (!e.shiftKey) setSelectedObject(undefined);
        setSelectionRect({
          startX: worldPos.x,
          startY: worldPos.y,
          endX: worldPos.x,
          endY: worldPos.y,
        });
        setIsDrawing(true);
        return;
      }

      if (currentTool === 'hand' || isSpacePan) {
        setIsPanning(true);
        setPanStart({ x: e.clientX, y: e.clientY, viewX, viewY });
        return;
      }

      if ((e as unknown as MouseEvent).button === 2) {
        return;
      }

      if (currentTool === 'eraser' && eraserMode === 'object') {
        const hitId = findCanvasObjectIdAt(objects, worldPos.x, worldPos.y, {
          includeImages: true,
        });
        if (hitId) {
          saveHistory();
          const removed = objects.find((o) => o.id === hitId);
          const remaining = objects.filter((o) => o.id !== hitId);
          removeObject(hitId);

          if (removed) {
            let minX = 0,
              minY = 0,
              maxX = 0,
              maxY = 0;
            if (removed.type === 'stroke' && removed.points && removed.points.length) {
              minX = Math.min(...removed.points.map((p) => p.x)) - removed.size;
              minY = Math.min(...removed.points.map((p) => p.y)) - removed.size;
              maxX = Math.max(...removed.points.map((p) => p.x)) + removed.size;
              maxY = Math.max(...removed.points.map((p) => p.y)) + removed.size;
            } else if (
              (removed.type === 'line' ||
                removed.type === 'rectangle' ||
                removed.type === 'ellipse' ||
                removed.type === 'circle' ||
                removed.type === 'triangle' ||
                removed.type === 'star' ||
                removed.type === 'parabola' ||
                removed.type === 'image') &&
              removed.x !== undefined &&
              removed.y !== undefined &&
              removed.width !== undefined &&
              removed.height !== undefined
            ) {
              const rx2 = removed.x + removed.width;
              const ry2 = removed.y + removed.height;
              minX = Math.min(removed.x, rx2) - removed.size;
              minY = Math.min(removed.y, ry2) - removed.size;
              maxX = Math.max(removed.x, rx2) + removed.size;
              maxY = Math.max(removed.y, ry2) + removed.size;
            } else if (
              removed.type === 'text' &&
              removed.x !== undefined &&
              removed.y !== undefined &&
              removed.width !== undefined &&
              removed.height !== undefined
            ) {
              minX = removed.x - removed.size;
              minY = removed.y - removed.height / 2 - removed.size;
              maxX = removed.x + removed.width + removed.size;
              maxY = removed.y + removed.height / 2 + removed.size;
            }
            const width = Math.max(0, maxX - minX);
            const height = Math.max(0, maxY - minY);

            workerRef.current?.postMessage({
              type: 'clear-region',
              x: minX,
              y: minY,
              width,
              height,
            });

            for (const obj of remaining) {
              let ox1 = 0,
                oy1 = 0,
                ox2 = 0,
                oy2 = 0;
              if (obj.type === 'stroke' && obj.points && obj.points.length) {
                ox1 = Math.min(...obj.points.map((p) => p.x)) - obj.size;
                oy1 = Math.min(...obj.points.map((p) => p.y)) - obj.size;
                ox2 = Math.max(...obj.points.map((p) => p.x)) + obj.size;
                oy2 = Math.max(...obj.points.map((p) => p.y)) + obj.size;
              } else if (
                (obj.type === 'line' ||
                  obj.type === 'rectangle' ||
                  obj.type === 'ellipse' ||
                  obj.type === 'circle' ||
                  obj.type === 'triangle' ||
                  obj.type === 'star' ||
                  obj.type === 'parabola' ||
                  obj.type === 'image') &&
                obj.x !== undefined &&
                obj.y !== undefined &&
                obj.width !== undefined &&
                obj.height !== undefined
              ) {
                const x2 = obj.x + obj.width;
                const y2 = obj.y + obj.height;
                ox1 = Math.min(obj.x, x2) - obj.size;
                oy1 = Math.min(obj.y, y2) - obj.size;
                ox2 = Math.max(obj.x, x2) + obj.size;
                oy2 = Math.max(obj.y, y2) + obj.size;
              } else if (
                obj.type === 'text' &&
                obj.x !== undefined &&
                obj.y !== undefined &&
                obj.width !== undefined &&
                obj.height !== undefined
              ) {
                ox1 = obj.x - obj.size;
                oy1 = obj.y - obj.height / 2 - obj.size;
                ox2 = obj.x + obj.width + obj.size;
                oy2 = obj.y + obj.height / 2 + obj.size;
              }
              const intersects = !(
                ox2 < minX ||
                ox1 > minX + width ||
                oy2 < minY ||
                oy1 > minY + height
              );
              if (!intersects) continue;

              if (obj.type === 'stroke' && obj.points && obj.points.length > 1) {
                const strokes: StrokeData[] = [];
                const objGroupId = obj.id;
                for (let i = 0; i < obj.points.length - 1; i++) {
                  const a = obj.points[i];
                  const b = obj.points[i + 1];
                  strokes.push({
                    x0: a.x,
                    y0: a.y,
                    x1: b.x,
                    y1: b.y,
                    color: obj.color,
                    size: obj.size,
                    alpha: obj.alpha ?? 1,
                    groupId: objGroupId,
                    timestamp: Date.now(),
                  });
                }
                if (strokes.length) {
                  workerRef.current?.postMessage({
                    type: 'strokes',
                    data: strokes,
                  });
                }
              } else if (
                (obj.type === 'line' ||
                  obj.type === 'rectangle' ||
                  obj.type === 'ellipse' ||
                  obj.type === 'circle' ||
                  obj.type === 'triangle' ||
                  obj.type === 'parabola') &&
                obj.x !== undefined &&
                obj.y !== undefined &&
                obj.width !== undefined &&
                obj.height !== undefined
              ) {
                const shape: ShapeData = {
                  id: obj.id,
                  type: obj.type,
                  x: obj.x,
                  y: obj.y,
                  width: obj.width,
                  height: obj.height,
                  color: obj.color,
                  size: obj.size,
                  alpha: obj.alpha ?? 1,
                  filled: obj.filled,
                  points: obj.points,
                  orientation: (obj as { orientation?: 'up' | 'down' | 'left' | 'right' })
                    .orientation,
                  timestamp: Date.now(),
                };
                workerRef.current?.postMessage({ type: 'shape', data: shape });
              } else if (
                obj.type === 'text' &&
                obj.x !== undefined &&
                obj.y !== undefined &&
                obj.width !== undefined &&
                obj.height !== undefined
              ) {
                const shape: ShapeData = {
                  id: obj.id,
                  type: obj.type,
                  x: obj.x,
                  y: obj.y,
                  width: obj.width,
                  height: obj.height,
                  color: obj.color,
                  size: obj.size,
                  alpha: obj.alpha ?? 1,
                  text: obj.text,
                  fontSize: obj.fontSize,
                  timestamp: Date.now(),
                };
                workerRef.current?.postMessage({ type: 'shape', data: shape });
              } else if (
                obj.type === 'image' &&
                obj.x !== undefined &&
                obj.y !== undefined &&
                obj.width !== undefined &&
                obj.height !== undefined
              ) {
                const shape: ShapeData = {
                  id: obj.id,
                  type: obj.type,
                  x: obj.x,
                  y: obj.y,
                  width: obj.width,
                  height: obj.height,
                  color: obj.color,
                  size: obj.size,
                  alpha: obj.alpha ?? 1,
                  imageData: obj.imageData,
                  timestamp: Date.now(),
                };
                workerRef.current?.postMessage({ type: 'shape', data: shape });
              }
            }
          }
        }
        return;
      }

      if (currentTool === 'pen' || currentTool === 'eraser') {
        setIsDrawing(true);
        setLastPoint(worldPos);
        setCurrentStroke([]);

        strokeGroupRef.current = generateId();
      } else if (['line', 'rectangle', 'ellipse', 'star'].includes(currentTool)) {
        setIsDrawing(true);
        setStartPoint(worldPos);
        setLastPoint(worldPos);
        saveHistory();
      } else if (currentTool === 'text') {
        setTextInputPos({
          x: Math.max(12, Math.min(e.clientX, window.innerWidth - 532)),
          y: Math.max(12, Math.min(e.clientY, window.innerHeight - 224)),
          worldX: worldPos.x,
          worldY: worldPos.y,
        });
        setTextInputValue('');
        setTimeout(() => textInputRef.current?.focus(), 0);
      } else if (currentTool === 'triangle') {
        if (triangleMode === 'custom') {
          if (triangleVertices.length === 0) {
            setTriangleVertices([worldPos]);
          } else if (triangleVertices.length === 1) {
            setTriangleVertices([...triangleVertices, worldPos]);
          } else if (triangleVertices.length === 2) {
            const vertices = [...triangleVertices, worldPos];

            const xs = vertices.map((v) => v.x);
            const ys = vertices.map((v) => v.y);
            const minX = Math.min(...xs);
            const minY = Math.min(...ys);
            const maxX = Math.max(...xs);
            const maxY = Math.max(...ys);

            const triangleObject = {
              id: generateId(),
              type: 'triangle' as const,
              points: vertices,
              x: minX,
              y: minY,
              width: maxX - minX,
              height: maxY - minY,
              color: brushColor,
              size: brushSize,
              alpha: brushOpacity,
              filled: useDrawingStore.getState().shapeFilled,
            };

            saveHistory();
            addObject(triangleObject);

            workerRef.current?.postMessage({
              type: 'shape',
              data: triangleObject,
            });

            setTriangleVertices([]);
          }
        } else {
          setIsDrawing(true);
          setStartPoint(worldPos);
          setLastPoint(worldPos);
          saveHistory();
        }
      }
    },
    [
      currentTool,
      eraserMode,
      screenToWorld,
      saveHistory,
      removeObject,
      objects,
      viewX,
      viewY,
      isSpacePan,
      triangleVertices,
      triangleMode,
      brushColor,
      brushSize,
      brushOpacity,
      addObject,
      setDraggedObject,
      textInputPos,
      canDraw,
      toast,
      setSelectedObject,
      setSelectedObjects,
      selectedObjectIds,
    ],
  );

  const draw = useCallback(
    (e: React.PointerEvent) => {
      if (canvasRef.current) {
        const worldPos = screenToWorld(e.clientX, e.clientY);
        emitCursor(worldPos.x, worldPos.y);
      }

      if (isPanning && panStart) {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const deltaX = e.clientX - panStart.x;
        const deltaY = e.clientY - panStart.y;

        const constrained = panViewportBy({
          zoom,
          viewX: panStart.viewX,
          viewY: panStart.viewY,
          deltaX: -deltaX,
          deltaY: -deltaY,
          canvasWidth: rect.width,
          canvasHeight: rect.height,
        });
        const newViewX = constrained.x;
        const newViewY = constrained.y;

        currentPanViewRef.current = { x: newViewX, y: newViewY };

        if (!panViewportScheduledRef.current) {
          panViewportScheduledRef.current = true;

          requestAnimationFrame(() => {
            panViewportScheduledRef.current = false;

            const latestView = currentPanViewRef.current;
            if (!latestView) return;

            setView(latestView.x, latestView.y);

            const canvas = canvasRef.current;
            if (canvas) {
              const rect = canvas.getBoundingClientRect();
              postRendererViewport(workerRef.current, rect, {
                zoom,
                viewX: latestView.x,
                viewY: latestView.y,
              });
            }
          });
        }
        return;
      }

      if (selectionRect) {
        const worldPos = screenToWorld(e.clientX, e.clientY);
        setSelectionRect((current) =>
          current ? { ...current, endX: worldPos.x, endY: worldPos.y } : current,
        );
        return;
      }

      const activeDrag = activeDragRef.current ?? draggedObject;
      if (activeDrag) {
        const worldPos = screenToWorld(e.clientX, e.clientY);
        const currentObjects = draggedObjectsRef.current || objects;
        const obj = currentObjects.find((o) => o.id === activeDrag.id);

        if (obj) {
          const updatedObjects =
            activeDrag.ids.length > 1
              ? translateObjectsBy(
                  currentObjects,
                  activeDrag.ids,
                  worldPos.x - activeDrag.offsetX - (obj.x ?? obj.points?.[0]?.x ?? 0),
                  worldPos.y - activeDrag.offsetY - (obj.y ?? obj.points?.[0]?.y ?? 0),
                )
              : translateObjectInCollection(currentObjects, activeDrag.id, worldPos, {
                  x: activeDrag.offsetX,
                  y: activeDrag.offsetY,
                });

          draggedObjectsRef.current = updatedObjects;

          if (!dragRedrawScheduledRef.current) {
            dragRedrawScheduledRef.current = true;
            requestAnimationFrame(() => {
              dragRedrawScheduledRef.current = false;

              if (draggedObjectsRef.current) {
                const updatedObjects = draggedObjectsRef.current;
                const previews = updatedObjects.filter((object) =>
                  activeDrag.ids.includes(object.id),
                );
                const updatedObj = previews.find((object) => object.id === activeDrag.id);
                if (updatedObj) {
                  setDragPreviewObject(updatedObj);
                  setDragPreviewObjects(previews);
                  for (const updatedObj of previews) {
                    if (
                      updatedObj.type === 'stroke' &&
                      updatedObj.points &&
                      updatedObj.points.length > 1
                    ) {
                      // Strokes live in the retained shape scene after a
                      // full redraw. Updating that entry by id is atomic for
                      // the next blit; removing/rebuilding a raster stroke
                      // exposed an empty frame and caused visible flicker.
                      const stroke: ShapeData = {
                        id: updatedObj.id,
                        type: 'stroke',
                        x: 0,
                        y: 0,
                        width: 0,
                        height: 0,
                        color: updatedObj.color,
                        size: updatedObj.size,
                        alpha: updatedObj.alpha ?? 1,
                        points: updatedObj.points,
                        properties: { hidden: updatedObj.hidden ?? false },
                        timestamp: Date.now(),
                      };
                      workerRef.current?.postMessage({ type: 'shape', data: stroke });
                    } else if (
                      (updatedObj.type === 'line' ||
                        updatedObj.type === 'rectangle' ||
                        updatedObj.type === 'ellipse' ||
                        updatedObj.type === 'circle' ||
                        updatedObj.type === 'triangle' ||
                        updatedObj.type === 'parabola' ||
                        updatedObj.type === 'text' ||
                        updatedObj.type === 'image' ||
                        updatedObj.type === 'star' ||
                        updatedObj.type === 'arrow') &&
                      updatedObj.x !== undefined &&
                      updatedObj.y !== undefined
                    ) {
                      const shape: ShapeData = {
                        id: updatedObj.id,
                        type: updatedObj.type,
                        x: updatedObj.x,
                        y: updatedObj.y,
                        width: updatedObj.width ?? 0,
                        height: updatedObj.height ?? 0,
                        color: updatedObj.color,
                        size: updatedObj.size,
                        alpha: updatedObj.alpha ?? 1,
                        filled: updatedObj.filled,
                        orientation: (
                          updatedObj as {
                            orientation?: 'up' | 'down' | 'left' | 'right';
                          }
                        ).orientation,
                        text: updatedObj.text,
                        fontSize: updatedObj.fontSize,
                        imageData: updatedObj.imageData,
                        points: updatedObj.points,
                        // The worker only reads transforms from `properties`.
                        // Preserve rotation in the incremental drag scene just
                        // like the full-scene renderer does, otherwise a moved
                        // rotated object temporarily renders unrotated.
                        properties: {
                          ...updatedObj.properties,
                          rotation: updatedObj.rotation ?? 0,
                          hidden: updatedObj.hidden ?? false,
                        },
                        timestamp: Date.now(),
                      };
                      workerRef.current?.postMessage({
                        type: 'shape',
                        data: shape,
                      });
                    }
                  }
                }
              }
            });
          }
        }
        return;
      }
      if (!isDrawing) return;
      // use-gesture supplies a native PointerEvent, while React handlers supply
      // a SyntheticEvent. Support both so drawing does not crash in browsers
      // that dispatch native events through the gesture handler.
      const native = ('nativeEvent' in e && e.nativeEvent
        ? e.nativeEvent
        : e) as unknown as PointerEvent & {
        getCoalescedEvents?: () => PointerEvent[];
      };
      const events = getPointerSamples(native);

      if (currentTool === 'pen' || (currentTool === 'eraser' && eraserMode === 'partial')) {
        let lp = lastPoint;
        for (let i = 0; i < events.length; i++) {
          const ev = events[i];
          const p = screenToWorld(ev.clientX, ev.clientY);
          if (!lp) {
            lp = p;
            continue;
          }

          if (!strokeGroupRef.current) {
            console.error('No groupId set for stroke - this should not happen');
            lp = p;
            continue;
          }

          const stroke: StrokeData = {
            x0: lp.x,
            y0: lp.y,
            x1: p.x,
            y1: p.y,
            color: currentTool === 'eraser' ? BG_COLORS[theme] : brushColor,
            size: pressureAdjustedSize(brushSize, ev),
            pressure: ev.pressure,
            alpha: brushOpacity,
            timestamp: Date.now(),
            groupId: strokeGroupRef.current,
          };
          enqueueWorkerStroke(stroke);
          setCurrentStroke((prev) => [...prev, stroke]);
          lp = p;
        }
        if (lp) setLastPoint(lp);
      } else if (['line', 'rectangle', 'ellipse', 'star'].includes(currentTool) && startPoint) {
        const lastEv = events[events.length - 1];
        const endPos = screenToWorld(lastEv.clientX, lastEv.clientY);
        const constrainedEnd = constrainShapeEnd(
          startPoint,
          endPos,
          currentTool,
          isShiftPressed || isConstraintMode,
        );
        const { x: endX, y: endY } = constrainedEnd;

        setPreviewShape({
          type: currentTool,
          startX: startPoint.x,
          startY: startPoint.y,
          endX,
          endY,
          color: brushColor,
          size: brushSize,
          alpha: brushOpacity,
        });
      } else if (currentTool === 'triangle' && triangleMode !== 'custom' && startPoint) {
        const lastEv = events[events.length - 1];
        const endPos = screenToWorld(lastEv.clientX, lastEv.clientY);

        setPreviewShape({
          type: 'triangle',
          startX: startPoint.x,
          startY: startPoint.y,
          endX: endPos.x,
          endY: endPos.y,
          color: brushColor,
          size: brushSize,
          alpha: brushOpacity,
        });
      }
    },
    [
      isDrawing,
      lastPoint,
      startPoint,
      currentTool,
      eraserMode,
      screenToWorld,
      brushColor,
      brushSize,
      brushOpacity,
      enqueueWorkerStroke,
      isShiftPressed,
      isConstraintMode,
      isPanning,
      selectionRect,
      panStart,
      zoom,
      setView,
      triangleMode,
      draggedObject,
      objects,
      theme,
      emitCursor,
    ],
  );

  const handleCanvasClick = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      if (currentTool !== 'triangle' || triangleMode !== 'custom') return;
      startDrawing(event as unknown as React.PointerEvent<HTMLCanvasElement>);
    },
    [currentTool, startDrawing, triangleMode],
  );

  const stopDrawing = useCallback(() => {
    if (selectionRect) {
      const left = Math.min(selectionRect.startX, selectionRect.endX);
      const right = Math.max(selectionRect.startX, selectionRect.endX);
      const top = Math.min(selectionRect.startY, selectionRect.endY);
      const bottom = Math.max(selectionRect.startY, selectionRect.endY);
      const ids = objects
        .filter((object) => {
          if (object.hidden || object.locked) return false;
          const bounds = getObjectBounds(object);
          return (
            bounds &&
            bounds.x >= left &&
            bounds.y >= top &&
            bounds.x + bounds.width <= right &&
            bounds.y + bounds.height <= bottom
          );
        })
        .map((object) => object.id);
      setSelectedObjects(expandObjectIdsWithGroups(objects, ids));
      setSelectionRect(null);
      setIsDrawing(false);
      return;
    }

    if (activeDragRef.current ?? draggedObject) {
      if (draggedObjectsRef.current) {
        const updatedObjects = draggedObjectsRef.current;
        setObjects(updatedObjects);
        draggedObjectsRef.current = null;
      }
      activeDragRef.current = null;
      setDragPreviewObject(null);
      setDragPreviewObjects(null);
      setDraggedObject(null);

      requestAnimationFrame(() => {
        requestFullRedraw();
      });
      return;
    }

    if (isPanning || currentTool === 'hand' || isSpacePan) {
      if (currentPanViewRef.current) {
        setView(currentPanViewRef.current.x, currentPanViewRef.current.y);
        currentPanViewRef.current = null;
      }
      setIsPanning(false);
      setPanStart(null);

      if (currentTool === 'hand' || isSpacePan || !isDrawing) {
        return;
      }
    }
    if (!isDrawing) return;
    flushWorkerStrokes();

    if (currentTool === 'pen' || (currentTool === 'eraser' && eraserMode === 'partial')) {
      if (currentStroke.length > 0) {
        if (FEATURES.AUTO_SHAPE && autoShape && currentTool === 'pen') {
          const pathPoints: { x: number; y: number }[] = [];
          const firstSeg = currentStroke[0];
          pathPoints.push({ x: firstSeg.x0, y: firstSeg.y0 });
          for (let i = 0; i < currentStroke.length; i++)
            pathPoints.push({ x: currentStroke[i].x1, y: currentStroke[i].y1 });
          const shape = detectShapeFromStroke(pathPoints);
          if (shape) {
            if (strokeGroupRef.current) {
              workerRef.current?.postMessage({
                type: 'remove-group',
                groupId: strokeGroupRef.current,
              });
            }

            const clearShapePayload = {
              id: 'temp',
              type:
                shape.kind === 'line'
                  ? 'line'
                  : shape.kind === 'parabola'
                    ? 'parabola'
                    : shape.kind,
              x: Math.min(shape.x, shape.x + shape.width),
              y: Math.min(shape.y, shape.y + shape.height),
              width: Math.abs(shape.width),
              height: Math.abs(shape.height),
              color: BG_COLORS[theme],
              size: Math.max(brushSize, 1),
              alpha: brushOpacity,
              orientation: (shape as { orientation?: 'up' | 'down' | 'left' | 'right' })
                .orientation,
            } as const;
            workerRef.current?.postMessage({
              type: 'clear-shape',
              data: clearShapePayload,
            });

            const normX = Math.min(shape.x, shape.x + shape.width);
            const normY = Math.min(shape.y, shape.y + shape.height);
            const normW = Math.abs(shape.width);
            const normH = Math.abs(shape.height);
            const common = {
              id: generateId(),
              x: normX,
              y: normY,
              width: normW,
              height: normH,
              color: brushColor,
              size: committedStrokeSize(currentStroke, brushSize),
              alpha: brushOpacity,
            } as const;
            let shapeObject: {
              id: string;
              type: 'parabola' | 'line' | 'rectangle' | 'ellipse' | 'circle' | 'triangle';
              x: number;
              y: number;
              width: number;
              height: number;
              color: string;
              size: number;
              alpha: number;
              filled?: boolean;
              orientation?: 'up' | 'down' | 'left' | 'right';
              points?: { x: number; y: number }[];
            };
            if (shape.kind === 'parabola') {
              shapeObject = {
                ...common,
                type: 'parabola' as const,
                orientation: shape.orientation,
              };
            } else if (shape.kind === 'line') {
              shapeObject = { ...common, type: 'line' as const };
            } else {
              shapeObject = {
                ...common,
                type: shape.kind as 'rectangle' | 'ellipse' | 'circle' | 'triangle',
                filled: useDrawingStore.getState().shapeFilled,
                ...(shape.kind === 'triangle' && shape.points?.length === 3
                  ? { points: shape.points }
                  : {}),
              };
            }

            addObject(shapeObject);
            saveHistory();
            workerRef.current?.postMessage({
              type: 'shape',
              data: shapeObject,
            });
          } else {
            const drawingObject = {
              id: generateId(),
              type: 'stroke' as const,
              points: buildStrokePoints(currentStroke),
              color: brushColor,
              size: brushSize,
              alpha: brushOpacity,
            };
            addObject(drawingObject);
            saveHistory();
          }
        } else {
          const drawingObject = {
            id: generateId(),
            type: 'stroke' as const,
            points: buildStrokePoints(currentStroke),
            color: currentTool === 'eraser' ? BG_COLORS[theme] : brushColor,
            size: committedStrokeSize(currentStroke, brushSize),
            alpha: brushOpacity,
          };
          addObject(drawingObject);
          saveHistory();
        }
      }
    } else if (
      ['line', 'rectangle', 'ellipse'].includes(currentTool) &&
      startPoint &&
      previewShape
    ) {
      let shapeObject;
      if (currentTool === 'line') {
        shapeObject = {
          id: generateId(),
          type: currentTool as 'line' | 'rectangle' | 'ellipse',
          x: startPoint.x,
          y: startPoint.y,
          width: previewShape.endX - startPoint.x,
          height: previewShape.endY - startPoint.y,
          color: brushColor,
          size: brushSize,
          alpha: brushOpacity,
        };
      } else {
        shapeObject = {
          id: generateId(),
          type: currentTool as 'line' | 'rectangle' | 'ellipse',
          x: Math.min(startPoint.x, previewShape.endX),
          y: Math.min(startPoint.y, previewShape.endY),
          width: Math.abs(previewShape.endX - startPoint.x),
          height: Math.abs(previewShape.endY - startPoint.y),
          color: brushColor,
          size: brushSize,
          alpha: brushOpacity,
          filled: useDrawingStore.getState().shapeFilled,
        };
      }

      addObject(shapeObject);

      workerRef.current?.postMessage({
        type: 'shape',
        data: shapeObject,
      });
    } else if (currentTool === 'star' && startPoint && previewShape) {
      const dx = previewShape.endX - startPoint.x;
      const dy = previewShape.endY - startPoint.y;
      const outerRadius = Math.sqrt(dx * dx + dy * dy);

      const x = startPoint.x - outerRadius;
      const y = startPoint.y - outerRadius;
      const width = outerRadius * 2;
      const height = outerRadius * 2;

      const starObject = {
        id: generateId(),
        type: 'star' as const,
        x,
        y,
        width,
        height,
        color: brushColor,
        size: brushSize,
        alpha: brushOpacity,
        filled: useDrawingStore.getState().shapeFilled,
        properties: {
          pointCount: starPoints,
        },
      };

      addObject(starObject);

      workerRef.current?.postMessage({
        type: 'shape',
        data: starObject,
      });
    } else if (
      currentTool === 'triangle' &&
      triangleMode !== 'custom' &&
      startPoint &&
      previewShape
    ) {
      const vertices = calculateTriangleVertices(
        startPoint.x,
        startPoint.y,
        previewShape.endX,
        previewShape.endY,
        triangleMode as 'right' | '45-45-90' | '30-60-90',
      );

      const xs = vertices.map((v) => v.x);
      const ys = vertices.map((v) => v.y);
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      const maxX = Math.max(...xs);
      const maxY = Math.max(...ys);

      const triangleObject = {
        id: generateId(),
        type: 'triangle' as const,
        points: vertices,
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
        color: brushColor,
        size: brushSize,
        alpha: brushOpacity,
        filled: useDrawingStore.getState().shapeFilled,
      };

      addObject(triangleObject);

      workerRef.current?.postMessage({
        type: 'shape',
        data: triangleObject,
      });
    }

    setIsDrawing(false);
    setLastPoint(null);
    setCurrentStroke([]);
    strokeGroupRef.current = null;
    setStartPoint(null);
    setPreviewShape(null);
  }, [
    isDrawing,
    currentStroke,
    currentTool,
    eraserMode,
    brushColor,
    brushSize,
    brushOpacity,
    addObject,
    saveHistory,
    startPoint,
    previewShape,
    flushWorkerStrokes,
    autoShape,
    detectShapeFromStroke,
    triangleMode,
    draggedObject,
    isPanning,
    isSpacePan,
    setView,
    requestFullRedraw,
    starPoints,
    theme,
    setObjects,
    selectionRect,
    setSelectedObjects,
    objects,
  ]);

  const handleZoomStep = useCallback(
    (factor: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const viewport = zoomViewportAtPoint({
        zoom,
        viewX,
        viewY,
        nextZoom: zoom * factor,
        focalX: rect.width / 2,
        focalY: rect.height / 2,
        canvasWidth: rect.width,
        canvasHeight: rect.height,
      });

      setZoom(viewport.zoom);
      setView(viewport.x, viewport.y);
      postRendererViewport(workerRef.current, rect, {
        zoom: viewport.zoom,
        viewX: viewport.x,
        viewY: viewport.y,
      });
    },
    [zoom, viewX, viewY, setZoom, setView],
  );

  const handleZoomIn = useCallback(() => handleZoomStep(1.2), [handleZoomStep]);
  const handleZoomOut = useCallback(() => handleZoomStep(1 / 1.2), [handleZoomStep]);
  const handleResetView = useCallback(() => {
    resetView();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    postRendererViewport(workerRef.current, rect, { zoom: 1, viewX: 0, viewY: 0 });
  }, [resetView]);

  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768 || 'ontouchstart' in window);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);

    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // The gesture library receives wheel events too, but a native non-passive
    // listener is required in Firefox/Safari to reliably suppress document
    // scrolling and browser zoom while the pointer is over the canvas.
    const preventDocumentScroll = (event: WheelEvent) => event.preventDefault();
    canvas.addEventListener('wheel', preventDocumentScroll, { passive: false });
    return () => canvas.removeEventListener('wheel', preventDocumentScroll);
  }, []);

  useGesture(
    {
      onDrag: ({ active, xy: [clientX, clientY], event, touches, tap }) => {
        // Custom triangles are a three-click tool. Keeping them out of the drag
        // gesture prevents pointer-move events from being recorded as vertices.
        if (currentTool === 'triangle' && triangleMode === 'custom') return;
        if (tap) return;

        const isMultiTouch = touches > 1;
        const isHandMode = currentTool === 'hand' || isSpacePan;

        // Pan logic
        if (isHandMode || isMultiTouch) {
          if (!isPanning && active) {
            setIsPanning(true);
            setPanStart({ x: clientX, y: clientY, viewX, viewY });
          } else if (isPanning && active && panStart) {
            const canvas = canvasRef.current;
            if (!canvas) return;

            const rect = canvas.getBoundingClientRect();
            const deltaX = clientX - panStart.x;
            const deltaY = clientY - panStart.y;

            const constrained = panViewportBy({
              zoom,
              viewX: panStart.viewX,
              viewY: panStart.viewY,
              deltaX: -deltaX,
              deltaY: -deltaY,
              canvasWidth: rect.width,
              canvasHeight: rect.height,
            });

            setView(constrained.x, constrained.y);

            postRendererViewport(workerRef.current, rect, {
              zoom,
              viewX: constrained.x,
              viewY: constrained.y,
            });
          } else if (!active) {
            setIsPanning(false);
            setPanStart(null);
          }
          return;
        }

        // Draw logic (Single touch, not hand mode)
        // Delegate to existing handlers for now, but wrapped
        const nativeEvent = event as unknown as React.PointerEvent;
        // Mock properties if missing or just pass what we can
        // We might need to manually call startDrawing / draw / stopDrawing logic here

        // Move deliberately does not set `isDrawing`: it is an object transform,
        // not a new canvas mark. Prefer the ref here so every subsequent pointer
        // update advances the existing drag instead of selecting the object again.
        if (active && activeDragRef.current) {
          draw(nativeEvent);
        } else if (!isDrawing && active) {
          // START DRAWING
          if (!canDraw && currentTool !== 'select') {
            // Toast logic should be here or in startDrawing
            return;
          }

          // Check if we are dragging an object
          if (currentTool === 'select' || currentTool === 'move') {
            // Reuse startDrawing logic for move... difficult to separate
            // Let's call startDrawing effectively
            // We need to construct a fake event or refactor startDrawing to take x,y
            startDrawing(nativeEvent);
          } else {
            startDrawing(nativeEvent);
          }
        } else if (isDrawing && active) {
          // DRAW MOVE
          draw(nativeEvent);
        } else if (!active) {
          // STOP DRAWING
          stopDrawing();
        }
      },
      onPinch: ({ origin: [cx, cy], offset: [s], first, memo }) => {
        if (first) {
          const canvas = canvasRef.current;
          if (!canvas) return { initialZoom: zoom };
          return { initialZoom: zoom };
        }

        const canvas = canvasRef.current;
        if (canvas) {
          const rect = canvas.getBoundingClientRect();
          // Center of pinch relative to canvas
          const pinchX = cx - rect.left;
          const pinchY = cy - rect.top;

          const viewport = zoomViewportAtPoint({
            zoom,
            viewX,
            viewY,
            nextZoom: memo.initialZoom * s,
            focalX: pinchX,
            focalY: pinchY,
            canvasWidth: rect.width,
            canvasHeight: rect.height,
          });

          setZoom(viewport.zoom);
          setView(viewport.x, viewport.y);

          postRendererViewport(workerRef.current, rect, {
            zoom: viewport.zoom,
            viewX: viewport.x,
            viewY: viewport.y,
          });
        }
        return memo;
      },
      onWheel: ({ event, active, delta: [dx, dy], ctrlKey }) => {
        // Keep the browser from scrolling or zooming the document while the
        // canvas handles this trackpad/mouse-wheel gesture.
        event.preventDefault();
        if (ctrlKey) {
          // Zoom
          const delta = dy > 0 ? 0.9 : 1.1; // Invert direction for standard feel

          const canvas = canvasRef.current;
          if (!canvas) return;

          const rect = canvas.getBoundingClientRect();
          const pointerEvent = event as unknown as { clientX: number; clientY: number };
          const mouseX = pointerEvent.clientX - rect.left;
          const mouseY = pointerEvent.clientY - rect.top;

          const viewport = zoomViewportAtPoint({
            zoom,
            viewX,
            viewY,
            nextZoom: zoom * delta,
            focalX: mouseX,
            focalY: mouseY,
            canvasWidth: rect.width,
            canvasHeight: rect.height,
          });

          setZoom(viewport.zoom);
          setView(viewport.x, viewport.y);

          postRendererViewport(workerRef.current, rect, {
            zoom: viewport.zoom,
            viewX: viewport.x,
            viewY: viewport.y,
          });
        } else {
          // Pan
          if (active) {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();

            const constrained = panViewportBy({
              zoom,
              viewX,
              viewY,
              deltaX: dx,
              deltaY: dy,
              canvasWidth: rect.width,
              canvasHeight: rect.height,
            });
            setView(constrained.x, constrained.y);

            postRendererViewport(workerRef.current, rect, {
              zoom,
              viewX: constrained.x,
              viewY: constrained.y,
            });
          }
        }
      },
    },
    {
      target: canvasRef,
      eventOptions: { passive: false },
      drag: { filterTaps: true, threshold: 3 },
      pinch: { scaleBounds: { min: 0.1, max: 5 }, modifierKey: null },
    },
  );

  return (
    <div
      className={`w-full h-full relative touch-none overscroll-none overflow-hidden ${
        theme === 'dark' ? 'bg-[#0a0a0a]' : 'bg-[#e0e0e0]'
      }`}
    >
      <canvas
        ref={canvasRef}
        data-object-count={objectCount}
        className={`absolute inset-0 w-full h-full touch-none ${
          currentTool === 'hand' || isSpacePan || isPanning
            ? isPanning
              ? 'cursor-grabbing'
              : 'cursor-grab'
            : 'cursor-crosshair'
        }`}
        onContextMenu={(e) => e.preventDefault()}
        onClick={handleCanvasClick}
      />
      {rendererStatus === 'failed' && (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center bg-background/90 p-6 text-center"
          role="alert"
        >
          <div>
            <p className="font-semibold">Canvas renderer unavailable</p>
            <p className="mt-2 text-sm text-muted-foreground">
              The canvas renderer could not start. Reload the board or try another browser.
            </p>
          </div>
        </div>
      )}
      {/* Live Cursors */}
      {canvasRef.current && (
        <LiveCursors
          cursors={cursors}
          zoom={zoom}
          viewX={viewX}
          viewY={viewY}
          canvasWidth={canvasRef.current.getBoundingClientRect().width}
          canvasHeight={canvasRef.current.getBoundingClientRect().height}
        />
      )}
      {/* World boundary indicator - shows the 4096x4096 drawable area */}
      {/* Drawn on top of canvas to show the boundary */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
        <rect
          x={(0 - viewX) * zoom}
          y={(0 - viewY) * zoom}
          width={WORLD_WIDTH * zoom}
          height={WORLD_HEIGHT * zoom}
          fill="none"
          stroke={theme === 'dark' ? '#475569' : '#94a3b8'}
          strokeWidth={2}
        />
      </svg>
      {remoteSelections.map((selection) => {
        const bounds = selection.objectIds
          .map((id) => objects.find((object) => object.id === id))
          .filter((object): object is DrawingObject => Boolean(object))
          .map(getObjectBounds)
          .filter(
            (objectBounds): objectBounds is NonNullable<typeof objectBounds> =>
              objectBounds !== null,
          )
          .reduce<NonNullable<ReturnType<typeof getObjectBounds>> | null>(
            (combined, objectBounds) => {
              if (!combined) return objectBounds;
              const x = Math.min(combined.x, objectBounds.x);
              const y = Math.min(combined.y, objectBounds.y);
              return {
                x,
                y,
                width:
                  Math.max(combined.x + combined.width, objectBounds.x + objectBounds.width) - x,
                height:
                  Math.max(combined.y + combined.height, objectBounds.y + objectBounds.height) - y,
              };
            },
            null,
          );
        if (!bounds) return null;
        const color = selection.color || '#8b5cf6';
        return (
          <svg
            key={selection.clientId ?? selection.userId}
            className="pointer-events-none absolute inset-0 z-[19] h-full w-full overflow-visible"
          >
            <rect
              x={(bounds.x - viewX) * zoom - 4}
              y={(bounds.y - viewY) * zoom - 4}
              width={Math.max(10, bounds.width * zoom + 8)}
              height={Math.max(10, bounds.height * zoom + 8)}
              rx="3"
              fill="none"
              stroke={color}
              strokeWidth="2"
              strokeDasharray="5 3"
            />
            <g
              transform={`translate(${(bounds.x - viewX) * zoom - 4} ${(bounds.y - viewY) * zoom - 24})`}
            >
              <rect width="112" height="17" rx="4" fill={color} />
              <text x="7" y="12" fill="white" fontSize="10" fontWeight="600">
                {selection.username} selecting
              </text>
            </g>
          </svg>
        );
      })}
      {multiSelectionBounds && (
        <svg className="pointer-events-none absolute inset-0 z-20 h-full w-full overflow-visible">
          <rect
            x={(multiSelectionBounds.x - viewX) * zoom - 5}
            y={(multiSelectionBounds.y - viewY) * zoom - 5}
            width={Math.max(12, multiSelectionBounds.width * zoom + 10)}
            height={Math.max(12, multiSelectionBounds.height * zoom + 10)}
            rx="3"
            fill="rgba(37, 99, 235, 0.04)"
            stroke="#2563eb"
            strokeWidth="2"
            strokeDasharray="6 4"
          />
          <g
            transform={`translate(${(multiSelectionBounds.x - viewX) * zoom - 5} ${(multiSelectionBounds.y - viewY) * zoom - 28})`}
          >
            <rect width="128" height="19" rx="4" fill="#2563eb" />
            <text x="8" y="13" fill="white" fontSize="11" fontWeight="600">
              {selectedObjects.length} selected
            </text>
            {projectRole !== 'viewer' && (
              <g
                className="pointer-events-auto cursor-pointer"
                role="button"
                aria-label="Delete selected objects"
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  deleteSelectedObjects();
                }}
              >
                <title>Delete selected objects</title>
                <rect x="104" width="24" height="19" rx="4" fill="#1d4ed8" />
                <text
                  x="116"
                  y="13"
                  fill="white"
                  fontSize="14"
                  fontWeight="600"
                  textAnchor="middle"
                >
                  ×
                </text>
              </g>
            )}
          </g>
        </svg>
      )}
      {selectedBounds && !multiSelectionBounds && (
        <svg className="pointer-events-none absolute inset-0 z-20 h-full w-full overflow-visible">
          <g
            transform={`rotate(${selectedRotation} ${(selectedBounds.x + selectedBounds.width / 2 - viewX) * zoom} ${(selectedBounds.y + selectedBounds.height / 2 - viewY) * zoom})`}
          >
            <rect
              x={(selectedBounds.x - viewX) * zoom - 5}
              y={(selectedBounds.y - viewY) * zoom - 5}
              width={Math.max(12, selectedBounds.width * zoom + 10)}
              height={Math.max(12, selectedBounds.height * zoom + 10)}
              rx="2"
              fill="none"
              stroke="#2563eb"
              strokeWidth="2"
            />
            {canDirectTransform && (
              <>
                <line
                  x1={(selectedBounds.x + selectedBounds.width / 2 - viewX) * zoom}
                  y1={(selectedBounds.y - viewY) * zoom - 5}
                  x2={(selectedBounds.x + selectedBounds.width / 2 - viewX) * zoom}
                  y2={(selectedBounds.y - viewY) * zoom - 28}
                  stroke="#2563eb"
                  strokeWidth="2"
                />
                <circle
                  className="pointer-events-auto cursor-grab active:cursor-grabbing"
                  cx={(selectedBounds.x + selectedBounds.width / 2 - viewX) * zoom}
                  cy={(selectedBounds.y - viewY) * zoom - 32}
                  r="6"
                  fill="white"
                  stroke="#2563eb"
                  strokeWidth="2"
                  onPointerDown={(event) => startTransform(event, 'rotate')}
                />
                {(
                  [
                    ['nw', 0, 0],
                    ['n', 0.5, 0],
                    ['ne', 1, 0],
                    ['e', 1, 0.5],
                    ['se', 1, 1],
                    ['s', 0.5, 1],
                    ['sw', 0, 1],
                    ['w', 0, 0.5],
                  ] as const
                ).map(([handle, horizontal, vertical]) => (
                  <rect
                    key={handle}
                    className="pointer-events-auto cursor-nwse-resize fill-white"
                    x={(selectedBounds.x + selectedBounds.width * horizontal - viewX) * zoom - 5}
                    y={(selectedBounds.y + selectedBounds.height * vertical - viewY) * zoom - 5}
                    width="10"
                    height="10"
                    rx="1"
                    stroke="#2563eb"
                    strokeWidth="2"
                    onPointerDown={(event) => startTransform(event, handle)}
                  />
                ))}
              </>
            )}
          </g>
        </svg>
      )}
      {selectionRect && (
        <svg className="pointer-events-none absolute inset-0 z-20 h-full w-full">
          <rect
            x={(Math.min(selectionRect.startX, selectionRect.endX) - viewX) * zoom}
            y={(Math.min(selectionRect.startY, selectionRect.endY) - viewY) * zoom}
            width={Math.abs(selectionRect.endX - selectionRect.startX) * zoom}
            height={Math.abs(selectionRect.endY - selectionRect.startY) * zoom}
            fill="rgba(37, 99, 235, 0.12)"
            stroke="#2563eb"
            strokeWidth="1.5"
            strokeDasharray="5 3"
          />
        </svg>
      )}
      {/* Zoom controls */}
      <div className="absolute top-4 left-4 z-40 flex items-center space-x-2">
        <Button
          onClick={handleZoomOut}
          variant="glass"
          size="sm"
          disabled={zoom <= 0.1}
          title="Zoom out"
        >
          <ZoomOut className="w-4 h-4" />
        </Button>
        <div className="min-w-[80px] rounded px-3 py-1 text-center font-mono text-sm tabular-nums glass">
          {(zoom * 100).toFixed(0)}%
        </div>
        <Button
          onClick={handleZoomIn}
          variant="glass"
          size="sm"
          disabled={zoom >= 5}
          title="Zoom in"
        >
          <ZoomIn className="w-4 h-4" />
        </Button>
        <Button onClick={handleResetView} variant="glass" size="sm" title="Reset view">
          <RotateCcw className="w-4 h-4" />
        </Button>
      </div>
      {/* Shape preview overlay */}
      {previewShape && (
        <>
          {previewShape.type === 'line' ? (
            <svg className="absolute pointer-events-none w-full h-full">
              <line
                x1={(previewShape.startX - viewX) * zoom}
                y1={(previewShape.startY - viewY) * zoom}
                x2={(previewShape.endX - viewX) * zoom}
                y2={(previewShape.endY - viewY) * zoom}
                stroke="#60a5fa"
                strokeWidth="2"
                strokeDasharray="8,4"
                opacity="0.6"
              />
            </svg>
          ) : (
            <svg className="absolute pointer-events-none w-full h-full">
              {(() => {
                const x = (Math.min(previewShape.startX, previewShape.endX) - viewX) * zoom;
                const y = (Math.min(previewShape.startY, previewShape.endY) - viewY) * zoom;
                const w = Math.abs(previewShape.endX - previewShape.startX) * zoom;
                const h = Math.abs(previewShape.endY - previewShape.startY) * zoom;
                if (previewShape.type === 'ellipse') {
                  const cx = x + w / 2;
                  const cy = y + h / 2;
                  const rx = w / 2;
                  const ry = h / 2;
                  return (
                    <ellipse
                      cx={cx}
                      cy={cy}
                      rx={rx}
                      ry={ry}
                      fill="none"
                      stroke="#60a5fa"
                      strokeWidth="2"
                      strokeDasharray="8,4"
                      opacity="0.6"
                    />
                  );
                }
                if (previewShape.type === 'triangle') {
                  const vertices = calculateTriangleVertices(
                    previewShape.startX,
                    previewShape.startY,
                    previewShape.endX,
                    previewShape.endY,
                    triangleMode as 'right' | '45-45-90' | '30-60-90',
                  );

                  if (vertices.length === 3) {
                    const x1 = (vertices[0].x - viewX) * zoom;
                    const y1 = (vertices[0].y - viewY) * zoom;
                    const x2 = (vertices[1].x - viewX) * zoom;
                    const y2 = (vertices[1].y - viewY) * zoom;
                    const x3 = (vertices[2].x - viewX) * zoom;
                    const y3 = (vertices[2].y - viewY) * zoom;
                    return (
                      <polygon
                        points={`${x1},${y1} ${x2},${y2} ${x3},${y3}`}
                        fill="none"
                        stroke="#60a5fa"
                        strokeWidth="2"
                        strokeDasharray="8,4"
                        opacity="0.6"
                      />
                    );
                  }
                }
                if (previewShape.type === 'star') {
                  const centerX = (previewShape.startX - viewX) * zoom;
                  const centerY = (previewShape.startY - viewY) * zoom;
                  const dx = (previewShape.endX - previewShape.startX) * zoom;
                  const dy = (previewShape.endY - previewShape.startY) * zoom;
                  const outerRadius = Math.sqrt(dx * dx + dy * dy);
                  const innerRadius = outerRadius * 0.38;
                  const pointCount = starPoints;

                  if (outerRadius < 5) return null;

                  const starPointsArr: string[] = [];
                  for (let i = 0; i < pointCount * 2; i++) {
                    const angle = (i * Math.PI) / pointCount - Math.PI / 2;
                    const radius = i % 2 === 0 ? outerRadius : innerRadius;
                    starPointsArr.push(
                      `${centerX + radius * Math.cos(angle)},${centerY + radius * Math.sin(angle)}`,
                    );
                  }
                  return (
                    <polygon
                      points={starPointsArr.join(' ')}
                      fill="none"
                      stroke="#60a5fa"
                      strokeWidth="2"
                      strokeDasharray="8,4"
                      opacity="0.6"
                    />
                  );
                }
                return (
                  <rect
                    x={x}
                    y={y}
                    width={w}
                    height={h}
                    fill="none"
                    stroke="#60a5fa"
                    strokeWidth="2"
                    strokeDasharray="8,4"
                    opacity="0.6"
                  />
                );
              })()}
            </svg>
          )}
        </>
      )}
      {currentTool === 'triangle' && triangleMode === 'custom' && triangleVertices.length > 0 && (
        <svg className="absolute pointer-events-none w-full h-full">
          {triangleVertices.map((v, i) => (
            <circle
              key={i}
              cx={(v.x - viewX) * zoom}
              cy={(v.y - viewY) * zoom}
              r="5"
              fill="#60a5fa"
              opacity="0.8"
            />
          ))}
          {triangleVertices.length >= 2 && (
            <>
              <line
                x1={(triangleVertices[0].x - viewX) * zoom}
                y1={(triangleVertices[0].y - viewY) * zoom}
                x2={(triangleVertices[1].x - viewX) * zoom}
                y2={(triangleVertices[1].y - viewY) * zoom}
                stroke="#60a5fa"
                strokeWidth="2"
                strokeDasharray="8,4"
                opacity="0.6"
              />
            </>
          )}
        </svg>
      )}
      {isMobile && ['rectangle', 'ellipse', 'triangle'].includes(currentTool) && (
        <Button
          onClick={() => setIsConstraintMode(!isConstraintMode)}
          variant={isConstraintMode ? 'default' : 'glass'}
          size="icon"
          className="fixed bottom-20 right-4 z-40 w-12 h-12"
          title={`${isConstraintMode ? 'Disable' : 'Enable'} perfect ${
            currentTool === 'ellipse'
              ? 'circle'
              : currentTool === 'triangle'
                ? 'equilateral triangle'
                : 'square'
          } mode`}
        >
          {currentTool === 'ellipse' ? (
            <Circle className={`w-6 h-6 ${isConstraintMode ? 'text-white' : ''}`} />
          ) : currentTool === 'triangle' ? (
            <Triangle className={`w-6 h-6 ${isConstraintMode ? 'text-white' : ''}`} />
          ) : (
            <Square className={`w-6 h-6 ${isConstraintMode ? 'text-white' : ''}`} />
          )}
        </Button>
      )}
      {textInputPos &&
        (isMobile ? (
          <div
            className="fixed inset-x-0 bottom-0 z-[10000] border-t border-stone-200 bg-stone-50 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-16px_40px_rgba(28,25,23,0.18)] dark:border-white/[0.1] dark:bg-[#211e1b] dark:shadow-black/45"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-stone-300 dark:bg-white/20" />
            <div className="mx-auto max-w-lg">
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500 dark:text-stone-400">
                  Add text
                </span>
                <div className="flex items-center gap-1 rounded-lg border border-stone-200 bg-white p-1 dark:border-white/[0.1] dark:bg-white/[0.04]">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-base"
                    aria-label="Decrease text size"
                    onClick={() => setTextFontSize(textFontSize - 2)}
                  >
                    −
                  </Button>
                  <label className="flex h-8 items-center border-x border-stone-200 pl-2 dark:border-white/[0.1]">
                    <input
                      type="number"
                      inputMode="numeric"
                      min="12"
                      max="240"
                      value={textFontSize}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        if (Number.isFinite(value)) setTextFontSize(value);
                      }}
                      className="w-9 bg-transparent text-right font-mono text-xs tabular-nums text-stone-700 outline-none dark:text-stone-200"
                      aria-label="Text font size in pixels"
                    />
                    <span className="px-1.5 text-xs text-stone-500">px</span>
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-base"
                    aria-label="Increase text size"
                    onClick={() => setTextFontSize(textFontSize + 2)}
                  >
                    +
                  </Button>
                </div>
              </div>
              <div className="mb-3 flex gap-2" aria-label="Text size presets">
                {[16, 24, 32, 48].map((size) => (
                  <Button
                    key={size}
                    type="button"
                    variant={textFontSize === size ? 'default' : 'secondary'}
                    size="sm"
                    className="h-8 min-w-11 px-2 font-mono text-xs"
                    onClick={() => setTextFontSize(size)}
                  >
                    {size}
                  </Button>
                ))}
              </div>
              <textarea
                ref={textInputRef}
                value={textInputValue}
                onChange={(e) => {
                  setTextInputValue(e.target.value);
                  e.currentTarget.style.height = 'auto';
                  e.currentTarget.style.height = `${Math.min(e.currentTarget.scrollHeight, 176)}px`;
                }}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    clearTextInput();
                  }
                }}
                autoFocus
                aria-label="Text to add to the canvas"
                placeholder="Type your note"
                className="min-h-[104px] w-full resize-none rounded-xl border border-stone-200 bg-white px-3 py-3 leading-[1.4] text-stone-900 outline-none placeholder:text-stone-400 focus:border-amber-500 dark:border-white/[0.1] dark:bg-stone-950/30 dark:text-stone-100 dark:placeholder:text-stone-600 dark:focus:border-amber-300"
                // The mobile composer is a stable writing surface. Font size affects
                // the placed object, not the size of text jumping around while typing.
                style={{ fontSize: '20px', color: brushColor }}
              />
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button variant="ghost" className="h-11" onClick={clearTextInput}>
                  Cancel
                </Button>
                <Button
                  className="h-11 bg-stone-900 text-amber-100 hover:bg-stone-800 dark:bg-amber-300 dark:text-stone-950 dark:hover:bg-amber-200"
                  onClick={submitTextInput}
                  disabled={!textInputValue.trim()}
                >
                  Place text
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div
            className="fixed z-[10000] w-[min(520px,calc(100vw-24px))] overflow-hidden rounded-xl border border-stone-200 bg-stone-50 shadow-xl shadow-stone-950/20 dark:border-white/[0.1] dark:bg-[#211e1b] dark:shadow-black/40"
            style={{ left: textInputPos.x, top: textInputPos.y }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="border-b border-stone-200 bg-stone-100/80 px-3 py-2 dark:border-white/[0.08] dark:bg-white/[0.025]">
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500 dark:text-stone-400">
                  <span className="h-2 w-2 rounded-full bg-amber-400 dark:bg-amber-300" />
                  Text
                </span>
                <div className="flex items-center rounded-md border border-stone-200 bg-white dark:border-white/[0.1] dark:bg-white/[0.04]">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label="Decrease text size"
                    onClick={() => setTextFontSize(textFontSize - 2)}
                  >
                    −
                  </Button>
                  <label className="flex h-7 items-center border-x border-stone-200 pl-1.5 dark:border-white/[0.1]">
                    <input
                      type="number"
                      inputMode="numeric"
                      min="12"
                      max="240"
                      value={textFontSize}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        if (Number.isFinite(value)) setTextFontSize(value);
                      }}
                      className="w-8 bg-transparent text-right font-mono text-[11px] tabular-nums text-stone-700 outline-none dark:text-stone-200"
                      aria-label="Text font size in pixels"
                    />
                    <span className="px-1 text-[10px] text-stone-500">px</span>
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label="Increase text size"
                    onClick={() => setTextFontSize(textFontSize + 2)}
                  >
                    +
                  </Button>
                </div>
              </div>
              <div className="mt-2 flex gap-1.5" aria-label="Text size presets">
                {[16, 24, 32, 48].map((size) => (
                  <Button
                    key={size}
                    type="button"
                    variant={textFontSize === size ? 'default' : 'secondary'}
                    size="sm"
                    className="h-6 min-w-9 px-1.5 font-mono text-[10px]"
                    onClick={() => setTextFontSize(size)}
                  >
                    {size}
                  </Button>
                ))}
              </div>
            </div>
            <textarea
              ref={textInputRef}
              value={textInputValue}
              onChange={(e) => {
                setTextInputValue(e.target.value);
                e.currentTarget.style.height = 'auto';
                const availableHeight = Math.max(112, window.innerHeight - textInputPos.y - 92);
                e.currentTarget.style.height = `${Math.min(e.currentTarget.scrollHeight, availableHeight)}px`;
              }}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  submitTextInput();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  clearTextInput();
                }
              }}
              autoFocus
              aria-label="Text to add to the canvas"
              aria-describedby="text-entry-hint"
              placeholder="Write a note…"
              className="min-h-[112px] w-full resize-none overflow-y-auto bg-transparent px-3 py-3 leading-[1.4] text-stone-900 outline-none placeholder:text-stone-400 dark:text-stone-100 dark:placeholder:text-stone-600"
              style={{
                fontSize: `${textFontSize}px`,
                color: brushColor,
              }}
            />
            <div className="flex items-center justify-between gap-2 border-t border-stone-200 bg-stone-100/50 px-3 py-2.5 dark:border-white/[0.08] dark:bg-white/[0.02]">
              <span id="text-entry-hint" className="text-[11px] text-stone-500 dark:text-stone-400">
                ⌘/Ctrl+Enter to place
              </span>
              <div className="flex shrink-0 gap-1.5">
                <Button size="sm" variant="ghost" onClick={clearTextInput}>
                  Discard
                </Button>
                <Button
                  size="sm"
                  className="bg-stone-900 text-amber-100 hover:bg-stone-800 dark:bg-amber-300 dark:text-stone-950 dark:hover:bg-amber-200"
                  onClick={submitTextInput}
                  disabled={!textInputValue.trim()}
                >
                  Place text
                </Button>
              </div>
            </div>
          </div>
        ))}
      <ShortcutsDialog
        mode="draw"
        open={showShortcuts}
        onOpenChange={setShowShortcuts}
        showTrigger={false}
      />
      ]{' '}
      <input
        id="image-upload-input"
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageUpload}
        className="hidden"
        aria-label="Upload image"
      />
    </div>
  );
}
