import { useRef, useEffect, useCallback, useState } from 'react';
import { useDrawingStore } from '@/store/drawingStore';
import { useDrawingSocket } from '@/hooks/useSocket';
import { usePerformanceMonitor } from '@/hooks/usePerformanceMonitor';
import { useFPSCounter } from '@/hooks/useFPSCounter';
import { useTheme } from '@/contexts/ThemeContext';
import { Button } from './ui/button';
import { Square, Circle, Triangle, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
 
import { generateId, isIOS } from '@/lib/utils';
import type { DrawingObject } from '@/store/drawingStore';
import type { StrokeData, ShapeData } from '@/types/socket';
import { detectShapes } from '@/lib/shapeDetectors';

const WORLD_WIDTH = 4096;
const WORLD_HEIGHT = 4096;

export function DrawingCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Removed extra world canvas element to reduce memory pressure on iOS
 
  
  const {
    currentTool,
    eraserMode,
    brushSize,
    brushColor,
    brushOpacity,
    triangleMode,
    zoom,
    viewX,
    viewY,
    objects,
    needsFullRedraw,
    clearFullRedraw,
    addObject,
    removeObject,
    saveHistory,
    updatePerformanceStats,
    setZoom,
    setView,
    resetView,
    autoShape,
    clearCanvas
  } = useDrawingStore();

  const { emitStroke, emitStrokes, emitShape, emitSnapshot, emitClear, on } = useDrawingSocket();
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
  const [isConstraintMode, setIsConstraintMode] = useState(false); // For mobile constraint mode
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number; viewX: number; viewY: number } | null>(null);
  const [isSpacePan, setIsSpacePan] = useState(false);
  const [triangleVertices, setTriangleVertices] = useState<{ x: number; y: number }[]>([]);
  const [textInputPos, setTextInputPos] = useState<{ x: number; y: number; worldX: number; worldY: number } | null>(null);
  const textInputRef = useRef<HTMLTextAreaElement>(null);
  // removed unused groupId state

  // Worker-based renderer
  const workerRef = useRef<Worker | null>(null);
  const pendingReplayRef = useRef<DrawingObject[] | null>(null);
  const workerStrokeQueueRef = useRef<StrokeData[]>([]);
  const workerFlushScheduledRef = useRef(false);
  const strokeGroupRef = useRef<string | null>(null);

  // Initialize world canvas redraw
  useEffect(() => {
    if (!needsFullRedraw) return;
    workerRef.current?.postMessage({ type: 'clear' });
    for (const obj of objects) {
      if (obj.type === 'stroke' && obj.points && obj.points.length > 1) {
        const strokes: StrokeData[] = [];
        for (let i = 0; i < obj.points.length - 1; i++) {
          const a = obj.points[i];
          const b = obj.points[i + 1];
          strokes.push({ x0: a.x, y0: a.y, x1: b.x, y1: b.y, color: obj.color, size: obj.size, alpha: obj.alpha ?? 1, timestamp: Date.now() });
        }
        if (strokes.length) workerRef.current?.postMessage({ type: 'strokes', data: strokes });
      } else if ((obj.type === 'line' || obj.type === 'rectangle' || obj.type === 'ellipse' || obj.type === 'circle' || obj.type === 'triangle' || obj.type === 'parabola' || obj.type === 'text') && obj.x !== undefined && obj.y !== undefined) {
        const shape: ShapeData = { 
          id: obj.id, 
          type: obj.type, 
          x: obj.x, 
          y: obj.y, 
          width: obj.width ?? 0, 
          height: obj.height ?? 0, 
          color: obj.color, 
          size: obj.size, 
          alpha: obj.alpha ?? 1, 
          filled: obj.filled, 
          orientation: (obj as { orientation?: 'up' | 'down' | 'left' | 'right' }).orientation, 
          text: obj.text,
          fontSize: obj.fontSize,
          timestamp: Date.now() 
        };
        workerRef.current?.postMessage({ type: 'shape', data: shape });
      }
    }
    clearFullRedraw();
  }, [needsFullRedraw, clearFullRedraw, objects]);

  // Removed worldCanvas setup; the worker owns the world surface

  // Setup canvas + worker
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Initialize worker once
    if (!workerRef.current) {
      try {
        const worker = new Worker(new URL('../workers/rendererWorker.ts', import.meta.url), { type: 'module' });
        workerRef.current = worker;
        
        // Check if OffscreenCanvas is supported
        if ('transferControlToOffscreen' in canvas) {
          // Transfer OffscreenCanvas
          const offscreen = canvas.transferControlToOffscreen();
          worker.postMessage({ type: 'init', canvas: offscreen, worldWidth: WORLD_WIDTH, worldHeight: WORLD_HEIGHT }, [offscreen]);
        } else {
          // Fallback: use regular canvas context
          console.warn('OffscreenCanvas not supported, using fallback rendering');
          worker.postMessage({ type: 'init-fallback', worldWidth: WORLD_WIDTH, worldHeight: WORLD_HEIGHT });
        }
      } catch (error) {
        console.error('Worker initialization failed:', error);
        // Continue without worker
      }
    }

    const sendViewport = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = isIOS() ? 1 : (window.devicePixelRatio || 1);
      workerRef.current?.postMessage({
        type: 'viewport',
        zoom,
        viewX,
        viewY,
        canvasWidth: rect.width,
        canvasHeight: rect.height,
        dpr
      });
    };

    sendViewport();
    const onResize = () => sendViewport();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, viewX, viewY]);

  // Send theme to worker when it changes
  useEffect(() => {
    if (!workerRef.current) return;
    // Map theme to appropriate background color
    const bgColor = theme === 'dark' ? '#0f172a' : '#f8fafc';
    workerRef.current.postMessage({ type: 'theme', bgColor });
  }, [theme]);

  // Track frame metrics without drawing on main thread
  const render = useCallback(() => {
    const frameStart = performance.now();
    if (shouldSkipFrame) return;
    const frameEnd = performance.now();
    updateMetrics(frameStart, frameEnd);
    updatePerformanceStats(fps, 0);
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
      emitStrokes(batch);
      workerStrokeQueueRef.current = [];
    }
    workerFlushScheduledRef.current = false;
  }, [emitStrokes]);

  const enqueueWorkerStroke = useCallback((stroke: StrokeData) => {
    workerStrokeQueueRef.current.push(stroke);
    if (!workerFlushScheduledRef.current) {
      workerFlushScheduledRef.current = true;
      requestAnimationFrame(() => flushWorkerStrokes());
    }
  }, [flushWorkerStrokes]);

  // FPS-capped animation loop
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

  // Keyboard event handlers for shortcuts and modifiers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const state = useDrawingStore.getState();

      // Modifiers
      if (e.key === 'Shift') {
        setIsShiftPressed(true);
      }
      
      // Check for editable elements
      const target = e.target as HTMLElement | null;
      const isEditable = !!(target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        (target as unknown as { isContentEditable?: boolean }).isContentEditable
      ));

      if (isEditable) return;

      // Shortcuts
      if (e.ctrlKey || e.metaKey) {
        // Undo/Redo
        if (e.key.toLowerCase() === 'z') {
          e.preventDefault();
          if (e.shiftKey) {
            state.redo();
          } else {
            state.undo();
          }
        } else if (e.key.toLowerCase() === 'y') {
          e.preventDefault();
          state.redo();
        }
        // Zoom controls
        else if (e.key === '=' || e.key === '+') {
          e.preventDefault();
          const zoom = state.zoom;
          const newZoom = Math.max(0.1, Math.min(5, zoom * 1.2));
          
          const canvas = canvasRef.current;
          if (canvas) {
            const rect = canvas.getBoundingClientRect();
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            
            const worldX = state.viewX + centerX / zoom;
            const worldY = state.viewY + centerY / zoom;
            
            const newViewX = worldX - centerX / newZoom;
            const newViewY = worldY - centerY / newZoom;
            
            state.setZoom(newZoom);
            state.setView(newViewX, newViewY);
            
            const dpr = isIOS() ? 1 : (window.devicePixelRatio || 1);
            workerRef.current?.postMessage({
              type: 'viewport',
              zoom: newZoom,
              viewX: newViewX,
              viewY: newViewY,
              canvasWidth: rect.width,
              canvasHeight: rect.height,
              dpr
            });
          }
        } else if (e.key === '-') {
          e.preventDefault();
          const zoom = state.zoom;
          const newZoom = Math.max(0.1, Math.min(5, zoom / 1.2));
          
          const canvas = canvasRef.current;
          if (canvas) {
            const rect = canvas.getBoundingClientRect();
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            
            const worldX = state.viewX + centerX / zoom;
            const worldY = state.viewY + centerY / zoom;
            
            const newViewX = worldX - centerX / newZoom;
            const newViewY = worldY - centerY / newZoom;
            
            state.setZoom(newZoom);
            state.setView(newViewX, newViewY);
            
            const dpr = isIOS() ? 1 : (window.devicePixelRatio || 1);
            workerRef.current?.postMessage({
              type: 'viewport',
              zoom: newZoom,
              viewX: newViewX,
              viewY: newViewY,
              canvasWidth: rect.width,
              canvasHeight: rect.height,
              dpr
            });
          }
        } else if (e.key === '0') {
          e.preventDefault();
          state.resetView();
          const canvas = canvasRef.current;
          if (canvas) {
            const rect = canvas.getBoundingClientRect();
            const dpr = isIOS() ? 1 : (window.devicePixelRatio || 1);
            workerRef.current?.postMessage({
              type: 'viewport',
              zoom: 1,
              viewX: 0,
              viewY: 0,
              canvasWidth: rect.width,
              canvasHeight: rect.height,
              dpr
            });
          }
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          if (window.confirm('Are you sure you want to clear the canvas?')) {
            state.clearCanvas();
            emitClear();
            workerRef.current?.postMessage({ type: 'clear' });
          }
        }
      } else {
        // Tool shortcuts
        switch (e.key.toLowerCase()) {
          case 'v':
          case 'h':
            state.setTool('hand');
            break;
          case 'p':
          case 'b': // Brush
            state.setTool('pen');
            break;
          case 'e':
            state.setTool('eraser');
            break;
          case 'l':
            state.setTool('line');
            break;
          case 'r':
            state.setTool('rectangle');
            break;
          case 'c':
          case 'o':
            state.setTool('ellipse');
            break;
          case 't':
            state.setTool('text');
            break;
          case 'i':
            state.setTool('eyedropper');
            break;
          case '3':
            state.setTool('triangle');
            break;
        }

        // Space to temporarily enable hand pan
        if (e.code === 'Space') {
          e.preventDefault();
          setIsSpacePan(true);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setIsShiftPressed(false);
        return;
      }
      if (e.code === 'Space') {
        setIsSpacePan(false);
        setIsPanning(false);
        setPanStart(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Reset constraint mode when switching tools
  useEffect(() => {
    if (!['rectangle', 'ellipse'].includes(currentTool)) {
      setIsConstraintMode(false);
    }
    // Reset triangle vertices when switching away from triangle tool
    if (currentTool !== 'triangle') {
      setTriangleVertices([]);
    }
    // Close text input when tool changes
    if (currentTool !== 'text') {
      setTextInputPos(null);
    }
  }, [currentTool]);

  // Socket event handlers
  useEffect(() => {
    const unsubscribeStroke = on('draw:stroke', (stroke: StrokeData) => {
      // Forward to worker for off-thread draw
      workerRef.current?.postMessage({ type: 'stroke', data: stroke });
    });

    const unsubscribeStrokes = on('draw:strokes', (strokes: StrokeData[]) => {
      workerRef.current?.postMessage({ type: 'strokes', data: strokes });
    });

    const unsubscribeShape = on('draw:shape', (shape: ShapeData) => {
      // Forward to worker for off-thread draw
      workerRef.current?.postMessage({ type: 'shape', data: shape });
    });

    const unsubscribeSnapshot = on('canvas:snapshot', (snapshot) => {
      if (!snapshot?.dataUrl) return;
      // Avoid heavy image decode on iOS; skip seeding and let strokes replay
      if (isIOS()) return;
      workerRef.current?.postMessage({ type: 'snapshot-image', dataUrl: snapshot.dataUrl, worldWidth: snapshot.worldW ?? WORLD_WIDTH, worldHeight: snapshot.worldH ?? WORLD_HEIGHT });
    });

    const unsubscribeClear = on('canvas:clear', () => {
      // Clear locally first
      workerRef.current?.postMessage({ type: 'clear' });
      // If a replay was queued (from remote clear), rebuild; for local deletes we don't use this path
      const list = pendingReplayRef.current;
      if (list && list.length) {
        for (const obj of list) {
          if (obj.type === 'stroke' && obj.points && obj.points.length > 1) {
            const strokes: StrokeData[] = [];
            for (let i = 0; i < obj.points.length - 1; i++) {
              const a = obj.points[i];
              const b = obj.points[i + 1];
              const s: StrokeData = {
                x0: a.x,
                y0: a.y,
                x1: b.x,
                y1: b.y,
                color: obj.color,
                size: obj.size,
                alpha: obj.alpha ?? 1,
                timestamp: Date.now()
              };
              strokes.push(s);
            }
            if (strokes.length) {
              workerRef.current?.postMessage({ type: 'strokes', data: strokes });
            }
          } else if ((obj.type === 'line' || obj.type === 'rectangle' || obj.type === 'ellipse' || obj.type === 'circle' || obj.type === 'triangle' || obj.type === 'parabola' || obj.type === 'text') && obj.x !== undefined && obj.y !== undefined) {
            const shape: ShapeData = {
              id: obj.id,
              type: obj.type,
              x: obj.x,
              y: obj.y,
              width: obj.width ?? 0,
              height: obj.height ?? 0,
              color: obj.color,
              size: obj.size,
              alpha: obj.alpha ?? 1,
              filled: obj.filled,
              orientation: (obj as { orientation?: 'up' | 'down' | 'left' | 'right' }).orientation,
              text: obj.text,
              fontSize: obj.fontSize,
              timestamp: Date.now()
            };
            workerRef.current?.postMessage({ type: 'shape', data: shape });
          }
        }
        pendingReplayRef.current = null;
      }
    });

    return () => {
      unsubscribeStroke();
      unsubscribeStrokes();
      unsubscribeShape();
      unsubscribeSnapshot();
      unsubscribeClear();
    };
  }, [on, emitShape, emitStrokes]);

  // kept for potential direct debug draws; unused in production path

  // no-op helpers removed; post directly where needed

  const distancePointToSegment = useCallback((px: number, py: number, x1: number, y1: number, x2: number, y2: number) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    if (dx === 0 && dy === 0) {
      const ddx = px - x1;
      const ddy = py - y1;
      return Math.sqrt(ddx * ddx + ddy * ddy);
    }
    const t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy);
    const tt = Math.max(0, Math.min(1, t));
    const projX = x1 + tt * dx;
    const projY = y1 + tt * dy;
    const ddx = px - projX;
    const ddy = py - projY;
    return Math.sqrt(ddx * ddx + ddy * ddy);
  }, []);

  const findHitObjectIdAt = useCallback((x: number, y: number) => {
    // Iterate from topmost (last) to bottom
    for (let i = objects.length - 1; i >= 0; i--) {
      const obj = objects[i];
      const tol = Math.max(6, obj.size);
      if (obj.type === 'stroke' && obj.points && obj.points.length > 1) {
        // Ignore background-color eraser strokes (treat them as holes, not objects)
        if (obj.color.toLowerCase() === '#0f172a') {
          continue;
        }
        for (let p = 0; p < obj.points.length - 1; p++) {
          const a = obj.points[p];
          const b = obj.points[p + 1];
          if (distancePointToSegment(x, y, a.x, a.y, b.x, b.y) <= tol) {
            return obj.id;
          }
        }
      } else if (obj.type === 'line' && obj.x !== undefined && obj.y !== undefined && obj.width !== undefined && obj.height !== undefined) {
        const x1 = obj.x;
        const y1 = obj.y;
        const x2 = obj.x + obj.width;
        const y2 = obj.y + obj.height;
        if (distancePointToSegment(x, y, x1, y1, x2, y2) <= tol) {
          return obj.id;
        }
        } else if ((obj.type === 'rectangle' || obj.type === 'ellipse') && obj.x !== undefined && obj.y !== undefined && obj.width !== undefined && obj.height !== undefined) {
          const minX = Math.min(obj.x, obj.x + obj.width) - tol;
          const minY = Math.min(obj.y, obj.y + obj.height) - tol;
          const maxX = Math.max(obj.x, obj.x + obj.width) + tol;
          const maxY = Math.max(obj.y, obj.y + obj.height) + tol;
          if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
            return obj.id;
          }
        } else if (obj.type === 'text' && obj.x !== undefined && obj.y !== undefined && obj.width !== undefined && obj.height !== undefined) {
          const minX = obj.x - tol;
          const minY = obj.y - obj.height / 2 - tol; // Text y is usually middle or baseline
          const maxX = obj.x + obj.width + tol;
          const maxY = obj.y + obj.height / 2 + tol;
          if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
            return obj.id;
          }
        }
      }
      return null;
    }, [objects, distancePointToSegment]);

  // Modern shape detection using the new pipeline
  const detectShapeFromStroke = useCallback((points: { x: number; y: number }[]):
    | { kind: 'rectangle' | 'ellipse' | 'circle' | 'triangle' | 'line'; x: number; y: number; width: number; height: number }
    | { kind: 'parabola'; x: number; y: number; width: number; height: number; orientation: 'up' | 'down' | 'left' | 'right' }
    | null => {
    
    if (!points || points.length < 3) return null;

    // Convert old thresholds to new format
    const oldThresholds = useDrawingStore.getState().autoShapeThresholds;
    
    try {
      // Use the new detection system
      const result = detectShapes(points, {
        debugMode: true,
        thresholds: {
          minConfidence: 0.5, // Lower minimum confidence
          maxError: 0.3,
          lineMaxError: 0.1, // Keep strict for lines
          lineMinLength: oldThresholds.minSizePx,
          rectangleMaxError: 0.3, // More permissive for hand-drawn squares
          rectangleEdgeRatio: 0.6, // More relaxed for hand-drawn shapes
          ellipseMaxError: 0.35, // More permissive than old system
          circleRoundnessTolerance: 0.25,
          triangleMaxError: 0.35, // More permissive for hand-drawn triangles
          triangleEdgeRatio: 0.5, // Even more permissive for hand-drawn triangles
          parabolaMaxError: 0.3, // More permissive
          parabolaMinCurvature: 0.05, // Much lower requirement for complexity
          parabolaSymmetryTolerance: 0.4,
          lineAngleTolerance: Math.PI / 12,
          rectangleCornerTolerance: Math.PI / 6,
          rectangleAspectRatioTolerance: 0.2,
          ellipseMinEccentricity: 0.05, // Lower eccentricity requirement
          triangleCornerTolerance: Math.PI / 4
        },
        strokeProcessingOptions: {
          minSize: oldThresholds.minSizePx,
          resampleStep: oldThresholds.resampleStep,
          closureTolerance: oldThresholds.closureFactor,
          simplificationTolerance: 0.5, // Less aggressive simplification
          smoothingWindow: 3
        }
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
            orientation: shape.properties.orientation as 'up' | 'down' | 'left' | 'right'
          };
        } else {
          const shapeObj = {
            kind: shape.type as 'rectangle' | 'ellipse' | 'circle' | 'triangle' | 'line',
            x: bbox.minX,
            y: bbox.minY,
            width: bbox.width,
            height: bbox.height
          };
          console.log(`Created shape object:`, shapeObj);
          return shapeObj;
        }
      }
    } catch (error) {
      console.warn('Shape detection failed, falling back to simple detection:', error);
    }

    // Fallback to simple detection if the new system fails
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
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
      return { kind: 'rectangle' as const, x: minX, y: minY, width: w, height: h };
    } else {
      return { kind: 'line' as const, x: first.x, y: first.y, width: last.x - first.x, height: last.y - first.y };
    }
  }, []);

  // removed unused replayObjects (region-based redraw is used instead)

  // Convert screen coordinates to world coordinates
  const screenToWorld = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    return {
      x: viewX + (x / zoom),
      y: viewY + (y / zoom)
    };
  }, [viewX, viewY, zoom]);

  // Helper function to constrain shapes (for perfect circles/squares)
  const constrainShape = useCallback((startX: number, startY: number, endX: number, endY: number, shapeType: string) => {
    if ((isShiftPressed || isConstraintMode) && (shapeType === 'rectangle' || shapeType === 'ellipse')) {
      // Make it a perfect square/circle by using the smaller dimension
      const deltaX = endX - startX;
      const deltaY = endY - startY;
      const size = Math.min(Math.abs(deltaX), Math.abs(deltaY));
      
      return {
        endX: startX + (deltaX >= 0 ? size : -size),
        endY: startY + (deltaY >= 0 ? size : -size)
      };
    }
    return { endX, endY };
  }, [isShiftPressed, isConstraintMode]);

  // Calculate triangle vertices based on mode
  const calculateTriangleVertices = useCallback((
    startX: number, 
    startY: number, 
    endX: number, 
    endY: number, 
    mode: 'right' | '45-45-90' | '30-60-90'
  ): { x: number; y: number }[] => {
    const width = endX - startX;
    const height = endY - startY;
    const absWidth = Math.abs(width);
    const absHeight = Math.abs(height);
    
    if (mode === 'right') {
      // Right triangle with right angle at start point
      // Preserves drawing direction
      return [
        { x: startX, y: startY },           // Start (right angle)
        { x: endX, y: startY },             // Horizontal from start
        { x: startX, y: endY }              // Vertical from start
      ];
    } else if (mode === '45-45-90') {
      // 45-45-90 triangle (isosceles right triangle)
      // Force equal legs while preserving direction
      const size = Math.min(absWidth, absHeight);
      const signX = width >= 0 ? 1 : -1;
      const signY = height >= 0 ? 1 : -1;
      
      return [
        { x: startX, y: startY },                    // Start (right angle)
        { x: startX + signX * size, y: startY },     // Horizontal
        { x: startX, y: startY + signY * size }      // Vertical
      ];
    } else if (mode === '30-60-90') {
      // 30-60-90 triangle
      // Ratio of sides: 1 : √3 : 2
      // Using height as the side opposite to 60°
      const shortLeg = absHeight / Math.sqrt(3); // opposite to 30°
      const signX = width >= 0 ? 1 : -1;
      const signY = height >= 0 ? 1 : -1;
      
      return [
        { x: startX, y: startY },                                // Top (90° angle)
        { x: startX + signX * shortLeg, y: startY + signY * absHeight }, // Bottom-right (30° angle)
        { x: startX, y: startY + signY * absHeight }            // Bottom-left (60° angle)
      ];
    }
    return [];
  }, []);

  // Drawing handlers
  const startDrawing = useCallback((e: React.PointerEvent) => {
    const worldPos = screenToWorld(e.clientX, e.clientY);
    try {
      (e.currentTarget as Element & { setPointerCapture?: (id: number) => void }).setPointerCapture?.(e.pointerId);
    } catch {
      // ignore pointer capture errors
    }
    
    // Hand tool: start panning
    if (currentTool === 'hand' || isSpacePan) {
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY, viewX, viewY });
      return;
    }

    // Right mouse button panning regardless of tool
    if ((e as unknown as MouseEvent).button === 2) {
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY, viewX, viewY });
      return;
    }
    
    if (currentTool === 'eraser' && eraserMode === 'object') {
      const hitId = findHitObjectIdAt(worldPos.x, worldPos.y);
      if (hitId) {
        saveHistory();
        const removed = objects.find(o => o.id === hitId);
        const remaining = objects.filter(o => o.id !== hitId);
        removeObject(hitId);
        // Compute bbox of removed object
        if (removed) {
          let minX = 0, minY = 0, maxX = 0, maxY = 0;
          if (removed.type === 'stroke' && removed.points && removed.points.length) {
            minX = Math.min(...removed.points.map(p => p.x)) - removed.size;
            minY = Math.min(...removed.points.map(p => p.y)) - removed.size;
            maxX = Math.max(...removed.points.map(p => p.x)) + removed.size;
            maxY = Math.max(...removed.points.map(p => p.y)) + removed.size;
          } else if ((removed.type === 'line' || removed.type === 'rectangle' || removed.type === 'ellipse') && removed.x !== undefined && removed.y !== undefined && removed.width !== undefined && removed.height !== undefined) {
            const rx2 = removed.x + removed.width;
            const ry2 = removed.y + removed.height;
            minX = Math.min(removed.x, rx2) - removed.size;
            minY = Math.min(removed.y, ry2) - removed.size;
            maxX = Math.max(removed.x, rx2) + removed.size;
            maxY = Math.max(removed.y, ry2) + removed.size;
          } else if (removed.type === 'text' && removed.x !== undefined && removed.y !== undefined && removed.width !== undefined && removed.height !== undefined) {
            minX = removed.x - removed.size;
            minY = removed.y - removed.height / 2 - removed.size;
            maxX = removed.x + removed.width + removed.size;
            maxY = removed.y + removed.height / 2 + removed.size;
          }
          const width = Math.max(0, maxX - minX);
          const height = Math.max(0, maxY - minY);
          // Clear just the bbox region
          workerRef.current?.postMessage({ type: 'clear-region', x: minX, y: minY, width, height });
          // Redraw only objects intersecting the cleared region
          for (const obj of remaining) {
            // Quick AABB for object
            let ox1 = 0, oy1 = 0, ox2 = 0, oy2 = 0;
            if (obj.type === 'stroke' && obj.points && obj.points.length) {
              ox1 = Math.min(...obj.points.map(p => p.x)) - obj.size;
              oy1 = Math.min(...obj.points.map(p => p.y)) - obj.size;
              ox2 = Math.max(...obj.points.map(p => p.x)) + obj.size;
              oy2 = Math.max(...obj.points.map(p => p.y)) + obj.size;
            } else if ((obj.type === 'line' || obj.type === 'rectangle' || obj.type === 'ellipse') && obj.x !== undefined && obj.y !== undefined && obj.width !== undefined && obj.height !== undefined) {
              const x2 = obj.x + obj.width;
              const y2 = obj.y + obj.height;
              ox1 = Math.min(obj.x, x2) - obj.size;
              oy1 = Math.min(obj.y, y2) - obj.size;
              ox2 = Math.max(obj.x, x2) + obj.size;
              oy2 = Math.max(obj.y, y2) + obj.size;
            } else if (obj.type === 'text' && obj.x !== undefined && obj.y !== undefined && obj.width !== undefined && obj.height !== undefined) {
              ox1 = obj.x - obj.size;
              oy1 = obj.y - obj.height / 2 - obj.size;
              ox2 = obj.x + obj.width + obj.size;
              oy2 = obj.y + obj.height / 2 + obj.size;
            }
            const intersects = !(ox2 < minX || ox1 > minX + width || oy2 < minY || oy1 > minY + height);
            if (!intersects) continue;

            if (obj.type === 'stroke' && obj.points && obj.points.length > 1) {
              const strokes: StrokeData[] = [];
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
                  timestamp: Date.now()
                });
              }
              if (strokes.length) {
                workerRef.current?.postMessage({ type: 'strokes', data: strokes });
              }
            } else if ((obj.type === 'line' || obj.type === 'rectangle' || obj.type === 'ellipse' || obj.type === 'circle' || obj.type === 'triangle' || obj.type === 'parabola') && obj.x !== undefined && obj.y !== undefined && obj.width !== undefined && obj.height !== undefined) {
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
                orientation: (obj as { orientation?: 'up' | 'down' | 'left' | 'right' }).orientation,
                timestamp: Date.now()
              };
              workerRef.current?.postMessage({ type: 'shape', data: shape });
            } else if (obj.type === 'text' && obj.x !== undefined && obj.y !== undefined && obj.width !== undefined && obj.height !== undefined) {
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
                timestamp: Date.now()
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
      if (currentTool === 'pen' && autoShape) {
        strokeGroupRef.current = generateId();
      } else {
        strokeGroupRef.current = null;
      }
      saveHistory();
    } else if (['line', 'rectangle', 'ellipse'].includes(currentTool)) {
      setIsDrawing(true);
      setStartPoint(worldPos);
      setLastPoint(worldPos);
        saveHistory();
      } else if (currentTool === 'text') {
        // Text tool: click to start typing
        setTextInputPos({ 
          x: e.clientX, 
          y: e.clientY, 
          worldX: worldPos.x, 
          worldY: worldPos.y 
        });
        // Wait for render then focus
        setTimeout(() => textInputRef.current?.focus(), 10);
      } else if (currentTool === 'triangle') {
        // Triangle mode depends on triangleMode setting
        if (triangleMode === 'custom') {
        // Custom mode: three-click mode
        if (triangleVertices.length === 0) {
          // First click: set first vertex
          setTriangleVertices([worldPos]);
        } else if (triangleVertices.length === 1) {
          // Second click: add second vertex
          setTriangleVertices([...triangleVertices, worldPos]);
        } else if (triangleVertices.length === 2) {
          // Third click: add third vertex and complete triangle
          const vertices = [...triangleVertices, worldPos];
          
          // Calculate bounding box
          const xs = vertices.map(v => v.x);
          const ys = vertices.map(v => v.y);
          const minX = Math.min(...xs);
          const minY = Math.min(...ys);
          const maxX = Math.max(...xs);
          const maxY = Math.max(...ys);
          
          // Create triangle object with vertices
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
            filled: useDrawingStore.getState().shapeFilled
          };
          
          saveHistory();
          addObject(triangleObject);
          
          // Send to worker
          workerRef.current?.postMessage({ 
            type: 'shape', 
            data: triangleObject 
          });
          
          // Emit to other users
          emitShape({
            ...triangleObject,
            timestamp: Date.now()
          });
          
          // Reset triangle vertices
          setTriangleVertices([]);
        }
      } else {
        // Preset modes (right, 45-45-90, 30-60-90): drag mode
        setIsDrawing(true);
        setStartPoint(worldPos);
        setLastPoint(worldPos);
        saveHistory();
      }
    }
  }, [currentTool, eraserMode, screenToWorld, saveHistory, findHitObjectIdAt, removeObject, objects, viewX, viewY, isSpacePan, autoShape, triangleVertices, triangleMode, brushColor, brushSize, brushOpacity, addObject, emitShape]);

  const draw = useCallback((e: React.PointerEvent) => {
    if (currentTool === 'hand' || isSpacePan) {
      if (!isPanning || !panStart) return;
      const deltaX = e.clientX - panStart.x;
      const deltaY = e.clientY - panStart.y;
      const newViewX = Math.max(0, Math.min(WORLD_WIDTH, panStart.viewX - deltaX / zoom));
      const newViewY = Math.max(0, Math.min(WORLD_HEIGHT, panStart.viewY - deltaY / zoom));
      setView(newViewX, newViewY);
      return;
    }
    if (!isDrawing) return;
    const native = e.nativeEvent as unknown as PointerEvent & { getCoalescedEvents?: () => PointerEvent[] };
    const coalesced = typeof native.getCoalescedEvents === 'function' ? native.getCoalescedEvents() : null;
    const events = coalesced && coalesced.length ? coalesced : [native];

    if (currentTool === 'pen' || (currentTool === 'eraser' && eraserMode === 'partial')) {
      let lp = lastPoint;
      for (let i = 0; i < events.length; i++) {
        const ev = events[i];
        const p = screenToWorld(ev.clientX, ev.clientY);
        if (!lp) {
          lp = p;
          continue;
        }
        const stroke: StrokeData = {
          x0: lp.x,
          y0: lp.y,
          x1: p.x,
          y1: p.y,
          color: currentTool === 'eraser' ? '#0f172a' : brushColor,
          size: brushSize,
          alpha: brushOpacity,
          timestamp: Date.now(),
          groupId: strokeGroupRef.current || undefined
        };
        enqueueWorkerStroke(stroke);
        setCurrentStroke(prev => [...prev, stroke]);
        lp = p;
      }
      if (lp) setLastPoint(lp);
    } else if (['line', 'rectangle', 'ellipse'].includes(currentTool) && startPoint) {
      // Apply constraint if needed
      const lastEv = events[events.length - 1];
      const endPos = screenToWorld(lastEv.clientX, lastEv.clientY);
      const { endX, endY } = constrainShape(startPoint.x, startPoint.y, endPos.x, endPos.y, currentTool);
      
      // Update preview shape for visual feedback
      setPreviewShape({
        type: currentTool,
        startX: startPoint.x,
        startY: startPoint.y,
        endX,
        endY,
        color: brushColor,
        size: brushSize,
        alpha: brushOpacity
      });
    } else if (currentTool === 'triangle' && triangleMode !== 'custom' && startPoint) {
      // Preset triangle modes: show drag preview
      const lastEv = events[events.length - 1];
      const endPos = screenToWorld(lastEv.clientX, lastEv.clientY);
      
      // Update preview shape for visual feedback
      setPreviewShape({
        type: 'triangle',
        startX: startPoint.x,
        startY: startPoint.y,
        endX: endPos.x,
        endY: endPos.y,
        color: brushColor,
        size: brushSize,
        alpha: brushOpacity
      });
    }
    // Custom triangle uses click mode, not drag mode - handled in startDrawing
  }, [isDrawing, lastPoint, startPoint, currentTool, eraserMode, screenToWorld, brushColor, brushSize, brushOpacity, enqueueWorkerStroke, constrainShape, isPanning, panStart, zoom, setView, isSpacePan, triangleMode]);

  const stopDrawing = useCallback(() => {
    if (currentTool === 'hand' || isSpacePan) {
      setIsPanning(false);
      setPanStart(null);
      return;
    }
    if (!isDrawing) return;
    flushWorkerStrokes();

    if (currentTool === 'pen' || (currentTool === 'eraser' && eraserMode === 'partial')) {
      if (currentStroke.length > 0) {
        // Optionally convert to shape if autoShape enabled and tool is pen
        if (autoShape && currentTool === 'pen') {
          const pathPoints: { x: number; y: number }[] = [];
          const firstSeg = currentStroke[0];
          pathPoints.push({ x: firstSeg.x0, y: firstSeg.y0 });
          for (let i = 0; i < currentStroke.length; i++) pathPoints.push({ x: currentStroke[i].x1, y: currentStroke[i].y1 });
          const shape = detectShapeFromStroke(pathPoints);
          if (shape) {
            // Option A: remove only the current stroke from vectors
            if (strokeGroupRef.current) {
              workerRef.current?.postMessage({ type: 'remove-group', groupId: strokeGroupRef.current });
            }

            // Option B: also clear the fitted shape area from the raster world to actually erase content
            // This preserves layering while removing existing pixels under the fitted shape
            const clearShapePayload = {
              id: 'temp',
              type: shape.kind === 'line' ? 'line' : (shape.kind === 'parabola' ? 'parabola' : shape.kind),
              x: Math.min(shape.x, shape.x + shape.width),
              y: Math.min(shape.y, shape.y + shape.height),
              width: Math.abs(shape.width),
              height: Math.abs(shape.height),
              color: '#0f172a',
              size: Math.max(brushSize, 1),
              alpha: brushOpacity,
              orientation: (shape as { orientation?: 'up' | 'down' | 'left' | 'right' }).orientation
            } as const;
            workerRef.current?.postMessage({ type: 'clear-shape', data: clearShapePayload });

            // Build shape object (normalize rect/ellipse; parabola keeps bbox + orientation)
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
              alpha: brushOpacity
            } as const;
            let shapeObject: {
              id: string;
              type: 'parabola' | 'line' | 'rectangle' | 'ellipse' | 'circle' | 'triangle';
              x: number; y: number; width: number; height: number;
              color: string; size: number; alpha: number;
              filled?: boolean;
              orientation?: 'up' | 'down' | 'left' | 'right';
            };
            if (shape.kind === 'parabola') {
              shapeObject = { ...common, type: 'parabola' as const, orientation: shape.orientation };
            } else if (shape.kind === 'line') {
              shapeObject = { ...common, type: 'line' as const };
            } else {
              shapeObject = { ...common, type: shape.kind as 'rectangle' | 'ellipse' | 'circle' | 'triangle', filled: useDrawingStore.getState().shapeFilled };
            }

            addObject(shapeObject);
            workerRef.current?.postMessage({ type: 'shape', data: shapeObject });
            emitShape({ ...shapeObject, timestamp: Date.now() });
          } else {
            // Fallback to stroke object
            const drawingObject = {
              id: generateId(),
              type: 'stroke' as const,
              points: currentStroke.map(s => ({ x: s.x1, y: s.y1 })),
              color: brushColor,
              size: brushSize,
              alpha: brushOpacity
            };
            addObject(drawingObject);
            // Stroke already emitted incrementally
          }
        } else {
          // Create drawing object normally
          const drawingObject = {
            id: generateId(),
            type: 'stroke' as const,
            points: currentStroke.map(s => ({ x: s.x1, y: s.y1 })),
            color: currentTool === 'eraser' ? '#0f172a' : brushColor,
            size: brushSize,
            alpha: brushOpacity
          };
          addObject(drawingObject);
          // Stroke already emitted incrementally
        }
      }
    } else if (['line', 'rectangle', 'ellipse'].includes(currentTool) && startPoint && previewShape) {
      // Create shape object
      let shapeObject;
      if (currentTool === 'line') {
        // For lines, preserve the direction from start to end
        shapeObject = {
          id: generateId(),
          type: currentTool as 'line' | 'rectangle' | 'ellipse',
          x: startPoint.x,
          y: startPoint.y,
          width: previewShape.endX - startPoint.x,
          height: previewShape.endY - startPoint.y,
          color: brushColor,
          size: brushSize,
          alpha: brushOpacity
        };
      } else {
        // For rectangles and ellipses, normalize to positive bounds
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
          filled: useDrawingStore.getState().shapeFilled
        };
      }
      
      addObject(shapeObject);
      
      // Send shape to worker for drawing
      workerRef.current?.postMessage({ 
        type: 'shape', 
        data: shapeObject 
      });
      
      // Emit shape to other users (with timestamp for socket)
      emitShape({
        ...shapeObject,
        timestamp: Date.now()
      });
    } else if (currentTool === 'triangle' && triangleMode !== 'custom' && startPoint && previewShape) {
      // Preset triangle modes (right, 45-45-90, 30-60-90)
      const vertices = calculateTriangleVertices(
        startPoint.x,
        startPoint.y,
        previewShape.endX,
        previewShape.endY,
        triangleMode as 'right' | '45-45-90' | '30-60-90'
      );
      
      // Calculate bounding box
      const xs = vertices.map(v => v.x);
      const ys = vertices.map(v => v.y);
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
        filled: useDrawingStore.getState().shapeFilled
      };
      
      addObject(triangleObject);
      
      // Send to worker
      workerRef.current?.postMessage({ 
        type: 'shape', 
        data: triangleObject 
      });
      
      // Emit to other users
      emitShape({
        ...triangleObject,
        timestamp: Date.now()
      });
    }
    // Custom triangle handled in startDrawing with three-click mode

    setIsDrawing(false);
    setLastPoint(null);
    setCurrentStroke([]);
    strokeGroupRef.current = null;
    setStartPoint(null);
    setPreviewShape(null);
    
    // Emit snapshot periodically after cleanup
    if (!isIOS()) {
      setTimeout(() => {
        if (workerRef.current) {
          const handler = (e: MessageEvent) => {
            const msg = e.data;
            if (msg?.type === 'snapshot' && typeof msg.dataUrl === 'string') {
              emitSnapshot({
                dataUrl: msg.dataUrl,
                worldW: WORLD_WIDTH,
                worldH: WORLD_HEIGHT,
                timestamp: Date.now()
              });
              workerRef.current?.removeEventListener('message', handler as EventListener);
            }
          };
          workerRef.current.addEventListener('message', handler as EventListener);
          workerRef.current.postMessage({ type: 'snapshot' });
        }
      }, 100);
    }
  }, [isDrawing, currentStroke, currentTool, eraserMode, brushColor, brushSize, brushOpacity, addObject, startPoint, previewShape, emitShape, emitSnapshot, emitStroke, emitStrokes, flushWorkerStrokes, isSpacePan, autoShape, detectShapeFromStroke, triangleMode, calculateTriangleVertices]);


  // Zoom and pan handlers
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    // Invert zoom direction
    const delta = e.deltaY > 0 ? 1.1 : 0.9;
    const newZoom = Math.max(0.1, Math.min(5, zoom * delta));
    
    // Zoom towards cursor
    const canvas = canvasRef.current;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      const worldX = viewX + mouseX / zoom;
      const worldY = viewY + mouseY / zoom;
      
      // Align view to integer world pixels to reduce blur/halo
      const newViewX = worldX - mouseX / newZoom;
      const newViewY = worldY - mouseY / newZoom;
      
      setZoom(newZoom);
      setView(newViewX, newViewY);
      // Push viewport immediately to worker for accurate blit
      const dpr = isIOS() ? 1 : (window.devicePixelRatio || 1);
      workerRef.current?.postMessage({
        type: 'viewport',
        zoom: newZoom,
        viewX: newViewX,
        viewY: newViewY,
        canvasWidth: rect.width,
        canvasHeight: rect.height,
        dpr
      });
    }
  }, [zoom, viewX, viewY, setZoom, setView]);

  // Zoom button handlers (zoom toward canvas center)
  const handleZoomStep = useCallback((factor: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const newZoom = Math.max(0.1, Math.min(5, zoom * factor));
    const worldX = viewX + centerX / zoom;
    const worldY = viewY + centerY / zoom;
    const newViewX = worldX - centerX / newZoom;
    const newViewY = worldY - centerY / newZoom;
    setZoom(newZoom);
    setView(newViewX, newViewY);
    const dpr = isIOS() ? 1 : (window.devicePixelRatio || 1);
    workerRef.current?.postMessage({
      type: 'viewport',
      zoom: newZoom,
      viewX: newViewX,
      viewY: newViewY,
      canvasWidth: rect.width,
      canvasHeight: rect.height,
      dpr
    });
  }, [zoom, viewX, viewY, setZoom, setView]);

  const handleZoomIn = useCallback(() => handleZoomStep(1.2), [handleZoomStep]);
  const handleZoomOut = useCallback(() => handleZoomStep(1 / 1.2), [handleZoomStep]);
  const handleResetView = useCallback(() => {
    resetView();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = isIOS() ? 1 : (window.devicePixelRatio || 1);
    workerRef.current?.postMessage({
      type: 'viewport',
      zoom: 1,
      viewX: 0,
      viewY: 0,
      canvasWidth: rect.width,
      canvasHeight: rect.height,
      dpr
    });
  }, [resetView]);

  // Mobile detection
  const [isMobile, setIsMobile] = useState(false);
  
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768 || 'ontouchstart' in window);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return (
    <div className="w-full h-full relative overflow-hidden bg-transparent">
        <canvas
          ref={canvasRef}
          className={`absolute inset-0 w-full h-full touch-none ${(currentTool === 'hand' || isSpacePan || isPanning) ? (isPanning ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-crosshair'}`}
          onPointerDown={startDrawing}
          onPointerMove={draw}
          onPointerUp={stopDrawing}
          onPointerLeave={stopDrawing}
          onWheel={handleWheel}
          onContextMenu={(e) => e.preventDefault()}
        />

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
          <Button
            onClick={handleResetView}
            variant="glass"
            size="sm"
            title="Reset view"
          >
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
                    return <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke="#60a5fa" strokeWidth="2" strokeDasharray="8,4" opacity="0.6" />;
                  }
                  if (previewShape.type === 'triangle') {
                    // Calculate triangle vertices based on current mode
                    const vertices = calculateTriangleVertices(
                      previewShape.startX,
                      previewShape.startY,
                      previewShape.endX,
                      previewShape.endY,
                      triangleMode as 'right' | '45-45-90' | '30-60-90'
                    );
                    
                    if (vertices.length === 3) {
                      const x1 = (vertices[0].x - viewX) * zoom;
                      const y1 = (vertices[0].y - viewY) * zoom;
                      const x2 = (vertices[1].x - viewX) * zoom;
                      const y2 = (vertices[1].y - viewY) * zoom;
                      const x3 = (vertices[2].x - viewX) * zoom;
                      const y3 = (vertices[2].y - viewY) * zoom;
                      return <polygon points={`${x1},${y1} ${x2},${y2} ${x3},${y3}`} fill="none" stroke="#60a5fa" strokeWidth="2" strokeDasharray="8,4" opacity="0.6" />;
                    }
                  }
                  return <rect x={x} y={y} width={w} height={h} fill="none" stroke="#60a5fa" strokeWidth="2" strokeDasharray="8,4" opacity="0.6" />;
                })()}
              </svg>
            )}
          </>
        )}

        {/* Triangle vertex preview (custom mode only) */}
        {currentTool === 'triangle' && triangleMode === 'custom' && triangleVertices.length > 0 && (
          <svg className="absolute pointer-events-none w-full h-full">
            {/* Draw placed vertices */}
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
            {/* Draw lines between placed vertices */}
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

        {/* Mobile constraint button */}
        {isMobile && ['rectangle', 'ellipse'].includes(currentTool) && (
          <Button
            onClick={() => setIsConstraintMode(!isConstraintMode)}
            variant={isConstraintMode ? "default" : "glass"}
            size="icon"
            className="fixed bottom-20 right-4 z-40 w-12 h-12"
            title={`${isConstraintMode ? 'Disable' : 'Enable'} perfect ${currentTool === 'ellipse' ? 'circle' : currentTool === 'triangle' ? 'equilateral triangle' : 'square'} mode`}
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
        
        {/* Text Input Overlay */}
        {textInputPos && (
          <div
            style={{
              position: 'fixed',
              left: textInputPos.x,
              top: textInputPos.y,
              transform: 'translate(0, -50%)',
              zIndex: 50
            }}
          >
            <textarea
              ref={textInputRef}
              className="bg-transparent text-white border border-blue-500/50 rounded p-2 outline-none resize-none overflow-hidden min-w-[200px]"
              style={{ 
                fontSize: `${Math.max(12, brushSize * 3)}px`,
                lineHeight: '1.2',
                textShadow: '0 0 2px black'
              }}
              placeholder="Type here..."
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  const text = e.currentTarget.value.trim();
                  if (text) {
                    // Approximate width/height for hit detection and erasure
                    const fontSize = Math.max(12, brushSize * 3);
                    const ctx = document.createElement('canvas').getContext('2d');
                    if (ctx) ctx.font = `${fontSize}px sans-serif`;
                    const width = ctx ? ctx.measureText(text).width : text.length * fontSize * 0.6;
                    const height = fontSize;

                    const textObject = {
                      id: generateId(),
                      type: 'text' as const,
                      x: textInputPos.worldX,
                      y: textInputPos.worldY,
                      text: text,
                      fontSize: fontSize,
                      color: brushColor,
                      size: brushSize,
                      alpha: brushOpacity,
                      width: width,
                      height: height
                    };
                    
                    addObject(textObject);
                    workerRef.current?.postMessage({ type: 'shape', data: textObject });
                    emitShape({ ...textObject, timestamp: Date.now() });
                  }
                  setTextInputPos(null);
                  useDrawingStore.getState().setTool('pen'); // Switch back to pen after text
                } else if (e.key === 'Escape') {
                  setTextInputPos(null);
                }
              }}
              onBlur={(e) => {
                // Commit on blur if there's text
                const text = e.currentTarget.value.trim();
                if (text) {
                  const fontSize = Math.max(12, brushSize * 3);
                  const ctx = document.createElement('canvas').getContext('2d');
                  if (ctx) ctx.font = `${fontSize}px sans-serif`;
                  const width = ctx ? ctx.measureText(text).width : text.length * fontSize * 0.6;
                  const height = fontSize;

                  const textObject = {
                    id: generateId(),
                    type: 'text' as const,
                    x: textInputPos.worldX,
                    y: textInputPos.worldY,
                    text: text,
                    fontSize: fontSize,
                    color: brushColor,
                    size: brushSize,
                    alpha: brushOpacity,
                    width: width,
                    height: height
                  };
                  
                  addObject(textObject);
                  workerRef.current?.postMessage({ type: 'shape', data: textObject });
                  emitShape({ ...textObject, timestamp: Date.now() });
                }
                setTextInputPos(null);
              }}
            />
          </div>
        )}
    </div>
  );
}
