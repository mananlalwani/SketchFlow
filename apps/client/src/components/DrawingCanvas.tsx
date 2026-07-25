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
import { useProjectPermissions } from '@/hooks/useProjectPermissions';
import { useCanvasRendererWorker } from '@/hooks/useCanvasRendererWorker';
import { useCanvasToolReset } from '@/hooks/useCanvasToolReset';
import { useCanvasKeyboardShortcuts } from '@/hooks/useCanvasKeyboardShortcuts';
import { useCanvasCollaborationAdapter } from '@/hooks/useCanvasCollaborationAdapter';
import { useCanvasImageInput } from '@/hooks/useCanvasImageInput';
import { findCanvasObjectIdAt } from '@/lib/canvasSelection';
import {
  buildStrokePoints,
  constrainShapeEnd,
  getPointerSamples,
  screenPointToWorld,
} from '@/lib/canvasPointer';
import { getObjectDragOffset, translateObjectInCollection } from '@/lib/canvasObjectTransform';
import { postRendererViewport } from '@/lib/canvasRendererViewport';
import { drawingObjectsToRendererScene } from '@/lib/canvasRendererObject';
import { useToast } from '@/hooks/use-toast';
import { FEATURES } from '@/config/features';
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

export function DrawingCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const {
    currentTool,
    eraserMode,
    brushSize,
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
  } = useDrawingStore();

  const { requestCanonicalHydration, commitCollaboration, isConnected, on } = useDrawingSocket();
  const { cursors, emitCursor } = useLiveCursors(currentProjectId ?? null);
  const { canDraw } = useProjectPermissions();
  const { toast } = useToast();
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
  const [draggedObject, setDraggedObject] = useState<{
    id: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const draggedObjectsRef = useRef<DrawingObject[] | null>(null);
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
  const workerStrokeQueueRef = useRef<StrokeData[]>([]);
  const workerFlushScheduledRef = useRef(false);
  const strokeGroupRef = useRef<string | null>(null);
  const collaborationCommitInFlightRef = useRef(false);

  // A canvas change is a durable collaboration operation, not a delayed REST
  // autosave. The server acknowledges the canonical revision before peers are
  // notified, so they always receive a complete, ordered document snapshot.
  useEffect(() => {
    if (
      !currentProjectId ||
      !canDraw ||
      !isConnected ||
      !unsavedChanges ||
      projectRevision === undefined ||
      collaborationCommitInFlightRef.current
    ) {
      return;
    }

    const projectId = currentProjectId;
    const committedDocumentVersion = documentVersion;
    collaborationCommitInFlightRef.current = true;
    setSaveStatus('syncing');
    const operationId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `operation-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;

    commitCollaboration(
      {
        protocolVersion: 1,
        projectId,
        operationId,
        expectedRevision: projectRevision,
        kind: 'replace-project',
        data: { version: 1, objects, width: WORLD_WIDTH, height: WORLD_HEIGHT },
        title: projectTitle,
      },
      (result) => {
        collaborationCommitInFlightRef.current = false;
        const state = useDrawingStore.getState();
        if (state.currentProjectId !== projectId) return;

        if (result.status === 'applied' || result.status === 'duplicate') {
          state.setProjectRevision(result.revision);
          state.markSaved(committedDocumentVersion);
          return;
        }

        if (result.status === 'conflict') {
          state.setSaveStatus('conflict');
          requestCanonicalHydration(projectId);
          return;
        }

        state.setSaveStatus(result.status === 'unavailable' ? 'retrying' : 'failed');
      },
    );
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
  ]);

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
          debugMode: true,
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

          console.log(`Shape conversion: ${shape.type}, bbox:`, bbox);

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
            };
            console.log(`Created shape object:`, shapeObj);
            return shapeObj;
          }
        }
      } catch (error) {
        console.warn('Shape detection failed, falling back to simple detection:', error);
      }

      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (const p of points) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }

      const w = Math.max(1, maxX - minX);
      const h = Math.max(1, maxY - minY);

      if (Math.min(w, h) < oldThresholds.minSizePx) return null;

      const first = points[0];
      const last = points[points.length - 1];
      const closureDist = Math.sqrt((last.x - first.x) ** 2 + (last.y - first.y) ** 2);
      const diag = Math.sqrt(w * w + h * h);
      const isClosed = closureDist <= Math.max(10, diag * oldThresholds.closureFactor);

      if (isClosed) {
        return {
          kind: 'rectangle' as const,
          x: minX,
          y: minY,
          width: w,
          height: h,
        };
      } else {
        return {
          kind: 'line' as const,
          x: first.x,
          y: first.y,
          width: last.x - first.x,
          height: last.y - first.y,
        };
      }
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

  const startDrawing = useCallback(
    (e: React.PointerEvent) => {
      if (!canDraw && currentTool !== 'hand' && currentTool !== 'move') {
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

      if (currentTool === 'move') {
        const hitId = findCanvasObjectIdAt(objects, worldPos.x, worldPos.y, {
          includeImages: true,
        });
        if (hitId) {
          const obj = objects.find((o) => o.id === hitId);
          if (obj) {
            const offset = getObjectDragOffset(obj, worldPos);
            setDraggedObject({ id: hitId, offsetX: offset.x, offsetY: offset.y });
            saveHistory();
            return;
          }
        }
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
          x: e.clientX,
          y: e.clientY,
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

      if (draggedObject) {
        const worldPos = screenToWorld(e.clientX, e.clientY);
        const currentObjects = draggedObjectsRef.current || objects;
        const obj = currentObjects.find((o) => o.id === draggedObject.id);

        if (obj) {
          const updatedObjects = translateObjectInCollection(
            currentObjects,
            draggedObject.id,
            worldPos,
            { x: draggedObject.offsetX, y: draggedObject.offsetY },
          );

          draggedObjectsRef.current = updatedObjects;

          if (!dragRedrawScheduledRef.current) {
            dragRedrawScheduledRef.current = true;
            requestAnimationFrame(() => {
              dragRedrawScheduledRef.current = false;

              if (draggedObjectsRef.current) {
                const updatedObj = draggedObjectsRef.current.find((o) => o.id === draggedObject.id);
                if (updatedObj) {
                  if (
                    updatedObj.type === 'stroke' &&
                    updatedObj.points &&
                    updatedObj.points.length > 1
                  ) {
                    workerRef.current?.postMessage({
                      type: 'remove-group',
                      groupId: updatedObj.id,
                    });

                    const strokes: StrokeData[] = [];
                    for (let i = 0; i < updatedObj.points.length - 1; i++) {
                      const a = updatedObj.points[i];
                      const b = updatedObj.points[i + 1];
                      strokes.push({
                        x0: a.x,
                        y0: a.y,
                        x1: b.x,
                        y1: b.y,
                        color: updatedObj.color,
                        size: updatedObj.size,
                        alpha: updatedObj.alpha ?? 1,
                        groupId: updatedObj.id,
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
                      properties: updatedObj.properties,
                      timestamp: Date.now(),
                    };
                    workerRef.current?.postMessage({
                      type: 'shape',
                      data: shape,
                    });
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
            size: brushSize,
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
    if (draggedObject) {
      if (draggedObjectsRef.current) {
        const updatedObjects = draggedObjectsRef.current;
        setObjects(updatedObjects);
        draggedObjectsRef.current = null;
      }
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
              size: brushSize,
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
            size: brushSize,
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

        if (!isDrawing && active) {
          // START DRAWING
          if (!canDraw && currentTool !== 'move') {
            // Toast logic should be here or in startDrawing
            return;
          }

          // Check if we are dragging an object
          if (currentTool === 'move') {
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
        if (ctrlKey) {
          // Zoom
          event.preventDefault();
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
      className={`w-full h-full relative overflow-hidden ${
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
      {(rendererStatus === 'unsupported' || rendererStatus === 'failed') && (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center bg-background/90 p-6 text-center"
          role="alert"
        >
          <div>
            <p className="font-semibold">Canvas renderer unavailable</p>
            <p className="mt-2 text-sm text-muted-foreground">
              This browser cannot start the required OffscreenCanvas renderer. Use a supported
              browser to edit this board.
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
        <div className="px-3 py-1 glass rounded text-sm font-mono min-w-[80px] text-center">
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
      {isMobile && ['rectangle', 'ellipse'].includes(currentTool) && (
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
      {textInputPos && (
        <textarea
          ref={textInputRef}
          value={textInputValue}
          onChange={(e) => setTextInputValue(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();

            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && textInputValue.trim()) {
              e.preventDefault();
              const text = textInputValue.trim();
              const fontSize = Math.max(16, brushSize * 2);
              const ctx = document.createElement('canvas').getContext('2d');
              ctx!.font = `${fontSize}px Inter, system-ui, sans-serif`;

              const lines = text.split('\n');
              const maxWidth = Math.max(...lines.map((line) => ctx!.measureText(line).width));
              const height = fontSize * lines.length * 1.2;

              const textObj = {
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
              addObject(textObj);
              workerRef.current?.postMessage({
                type: 'shape',
                data: { ...textObj, timestamp: Date.now() },
              });

              setTextInputPos(null);
              setTextInputValue('');
            } else if (e.key === 'Escape') {
              setTextInputPos(null);
              setTextInputValue('');
            }
          }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          autoFocus
          placeholder="Type here... (Ctrl+Enter to submit)"
          className="fixed z-[10000] min-w-[250px] min-h-[60px] max-w-[400px] resize font-[Inter,system-ui,sans-serif] leading-[1.4] bg-[#1e1e1e] border-2 border-[#3b82f6] rounded-lg p-3 outline-none"
          {...{
            style: {
              left: textInputPos.x,
              top: textInputPos.y,
              fontSize: `${Math.max(16, brushSize * 2)}px`,
              color: brushColor,
            },
          }}
        />
      )}
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
