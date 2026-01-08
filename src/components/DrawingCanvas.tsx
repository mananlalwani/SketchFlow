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
import { getImageFromClipboard, compressImage } from '@/lib/clipboard';
import { ShortcutsDialog } from './ShortcutsDialog';
import { LiveCursors } from './LiveCursors';
import { useLiveCursors } from '@/hooks/useLiveCursors';
import { useProjectPermissions } from '@/hooks/useProjectPermissions';
import { useToast } from '@/hooks/use-toast';
import { FEATURES } from '@/config/features';

const WORLD_WIDTH = 51200;  // 20x 1440p width (2560 × 20)
const WORLD_HEIGHT = 28800; // 20x 1440p height (1440 × 20)

// Background colors for each theme (must match Layout.tsx bg colors)
const BG_COLORS = {
  dark: '#020617',  // slate-950
  light: '#f8fafc'  // slate-50
} as const;

/**
 * Constrains view coordinates to keep viewport within world boundaries
 * @param viewX - Current view X position
 * @param viewY - Current view Y position
 * @param zoom - Current zoom level
 * @param canvasWidth - Canvas width in pixels
 * @param canvasHeight - Canvas height in pixels
 * @returns Constrained view coordinates
 */
function constrainView(
  viewX: number,
  viewY: number,
  zoom: number,
  canvasWidth: number,
  canvasHeight: number
): { x: number; y: number } {
  // Calculate the viewport size in world coordinates
  const viewportWorldWidth = canvasWidth / zoom;
  const viewportWorldHeight = canvasHeight / zoom;
  
  // Constrain X: viewport must stay within [0, WORLD_WIDTH]
  // Min: 0 (left edge of world)
  // Max: WORLD_WIDTH - viewportWorldWidth (right edge of world)
  const minX = 0;
  const maxX = Math.max(0, WORLD_WIDTH - viewportWorldWidth);
  const constrainedX = Math.max(minX, Math.min(maxX, viewX));
  
  // Constrain Y: viewport must stay within [0, WORLD_HEIGHT]
  // Min: 0 (top edge of world)
  // Max: WORLD_HEIGHT - viewportWorldHeight (bottom edge of world)
  const minY = 0;
  const maxY = Math.max(0, WORLD_HEIGHT - viewportWorldHeight);
  const constrainedY = Math.max(minY, Math.min(maxY, viewY));
  
  return { x: constrainedX, y: constrainedY };
}

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
    saveHistory,
    updatePerformanceStats,
    currentProjectId,
    setZoom,
    setView,
    resetView,
    autoShape
  } = useDrawingStore();

  const { emitStrokes, emitShape, emitSnapshot, emitClear, on } = useDrawingSocket();
  const { cursors, emitCursor } = useLiveCursors(currentProjectId);
  const { canEdit, canDraw, role } = useProjectPermissions();
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
  const [isConstraintMode, setIsConstraintMode] = useState(false); // For mobile constraint mode
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number; viewX: number; viewY: number } | null>(null);
  const [isSpacePan, setIsSpacePan] = useState(false);
  const [triangleVertices, setTriangleVertices] = useState<{ x: number; y: number }[]>([]);
  const [textInputPos, setTextInputPos] = useState<{ x: number; y: number; worldX: number; worldY: number } | null>(null);
  const textInputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [textInputValue, setTextInputValue] = useState('');
  const [draggedObject, setDraggedObject] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const draggedObjectsRef = useRef<DrawingObject[] | null>(null);
  const dragRedrawScheduledRef = useRef(false);
  const panViewportScheduledRef = useRef(false);
  const currentPanViewRef = useRef<{ x: number; y: number } | null>(null);
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
        // Each stroke object needs its own unique groupId for consolidation
        const objGroupId = obj.id; // Use the object's ID as the groupId
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
            groupId: objGroupId, // IMPORTANT: Use object ID as groupId
            timestamp: Date.now() 
          });
        }
        if (strokes.length) workerRef.current?.postMessage({ type: 'strokes', data: strokes });
      } else if ((obj.type === 'line' || obj.type === 'rectangle' || obj.type === 'ellipse' || obj.type === 'circle' || obj.type === 'triangle' || obj.type === 'parabola' || obj.type === 'text' || obj.type === 'image' || obj.type === 'star' || obj.type === 'arrow') && obj.x !== undefined && obj.y !== undefined) {
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
          imageData: obj.imageData,
          points: obj.points, // IMPORTANT: Include points for custom triangles
          properties: obj.properties, // IMPORTANT: Include properties for stars, etc.
          timestamp: Date.now() 
        };
        workerRef.current?.postMessage({ type: 'shape', data: shape });
      }
    }
    clearFullRedraw();
  }, [needsFullRedraw, clearFullRedraw, objects]);

  // Removed worldCanvas setup; the worker owns the world surface

  // Center the view on first load (only once)
  const initializedRef = useRef(false);
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const centerViewX = (WORLD_WIDTH / 2) - (rect.width / 2);
    const centerViewY = (WORLD_HEIGHT / 2) - (rect.height / 2);
    setView(centerViewX, centerViewY);
  }, [setView]);

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
    const onVisibilityChange = () => {
      // Refresh viewport when tab becomes visible
      if (!document.hidden) {
        sendViewport();
      }
    };
    const onFocus = () => {
      // Refresh viewport when window regains focus
      sendViewport();
    };
    
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onFocus);
    
    return () => {
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onFocus);
    };
     
  }, [zoom, viewX, viewY]);

  // Send theme to worker when it changes
  useEffect(() => {
    if (!workerRef.current) return;
    // Map theme to appropriate background color (must match BG_COLORS)
    const bgColor = theme === 'dark' ? '#020617' : '#f8fafc';
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
            
            // Calculate new view position (zoom towards center)
            const unconstrained = {
              x: worldX - centerX / newZoom,
              y: worldY - centerY / newZoom
            };
            
            // Apply constraints to keep view within world boundaries
            const constrained = constrainView(unconstrained.x, unconstrained.y, newZoom, rect.width, rect.height);
            
            state.setZoom(newZoom);
            state.setView(constrained.x, constrained.y);
            
            const dpr = isIOS() ? 1 : (window.devicePixelRatio || 1);
            workerRef.current?.postMessage({
              type: 'viewport',
              zoom: newZoom,
              viewX: constrained.x,
              viewY: constrained.y,
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
            
            // Calculate new view position (zoom towards center)
            const unconstrained = {
              x: worldX - centerX / newZoom,
              y: worldY - centerY / newZoom
            };
            
            // Apply constraints to keep view within world boundaries
            const constrained = constrainView(unconstrained.x, unconstrained.y, newZoom, rect.width, rect.height);
            
            state.setZoom(newZoom);
            state.setView(constrained.x, constrained.y);
            
            const dpr = isIOS() ? 1 : (window.devicePixelRatio || 1);
            workerRef.current?.postMessage({
              type: 'viewport',
              zoom: newZoom,
              viewX: constrained.x,
              viewY: constrained.y,
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
        
        // ? to show shortcuts dialog
        if (e.key === '?' || (e.shiftKey && e.key === '/')) {
          e.preventDefault();
          setShowShortcuts(true);
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
  }, [emitClear]);

  // Paste image from clipboard
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      // Don't handle paste if typing in text input
      if (textInputPos) return;
      
      const image = await getImageFromClipboard(e);
      if (!image) return;
      
      e.preventDefault();
      
      // Compress large images
      const maxSize = 1920;
      const needsCompression = image.width > maxSize || image.height > maxSize;
      const finalImage = needsCompression 
        ? await compressImage(image.dataUrl, maxSize, maxSize, 0.85)
        : image;
      
      // Calculate center position in world coordinates
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      const centerX = viewX + (canvas.width / 2 / zoom);
      const centerY = viewY + (canvas.height / 2 / zoom);
      
      const imageObject: DrawingObject = {
        id: generateId(),
        type: 'image',
        x: centerX - finalImage.width / 2,
        y: centerY - finalImage.height / 2,
        width: finalImage.width,
        height: finalImage.height,
        imageData: finalImage.dataUrl,
        color: '#ffffff',
        size: 1,
        alpha: 1,
      };
      
      saveHistory();
      addObject(imageObject);
      
      // Emit to other clients
      const shapeData: ShapeData = {
        id: imageObject.id,
        type: 'image',
        x: imageObject.x!,
        y: imageObject.y!,
        width: imageObject.width!,
        height: imageObject.height!,
        color: imageObject.color,
        size: imageObject.size,
        alpha: imageObject.alpha ?? 1,
        imageData: imageObject.imageData,
        timestamp: Date.now(),
      };
      emitShape(shapeData);
    };
    
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [viewX, viewY, zoom, textInputPos, addObject, saveHistory, emitShape]);

  // Handle image file selection
  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
      console.warn('Invalid file type');
      return;
    }
    
    // Read file as data URL
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      
      // Create image to get dimensions
      const img = new Image();
      img.onload = async () => {
        // Compress large images
        const maxSize = 1920;
        const needsCompression = img.width > maxSize || img.height > maxSize;
        const finalImage = needsCompression 
          ? await compressImage(dataUrl, maxSize, maxSize, 0.85)
          : { dataUrl, width: img.width, height: img.height };
        
        // Calculate center position in world coordinates
        const canvas = canvasRef.current;
        if (!canvas) return;
        
        const centerX = viewX + (canvas.width / 2 / zoom);
        const centerY = viewY + (canvas.height / 2 / zoom);
        
        const imageObject: DrawingObject = {
          id: generateId(),
          type: 'image',
          x: centerX - finalImage.width / 2,
          y: centerY - finalImage.height / 2,
          width: finalImage.width,
          height: finalImage.height,
          imageData: finalImage.dataUrl,
          color: '#ffffff',
          size: 1,
          alpha: 1,
        };
        
        saveHistory();
        addObject(imageObject);
        
        // Emit to other clients
        const shapeData: ShapeData = {
          id: imageObject.id,
          type: 'image',
          x: imageObject.x!,
          y: imageObject.y!,
          width: imageObject.width!,
          height: imageObject.height!,
          color: imageObject.color,
          size: imageObject.size,
          alpha: imageObject.alpha ?? 1,
          imageData: imageObject.imageData,
          timestamp: Date.now(),
        };
        emitShape(shapeData);
        
        // Switch back to move tool after adding image
        useDrawingStore.getState().setTool('move');
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
    
    // Reset the input so the same file can be selected again
    e.target.value = '';
  }, [viewX, viewY, zoom, addObject, saveHistory, emitShape]);

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
      setTextInputValue('');
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
            const objGroupId = obj.id; // Use object ID as groupId
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
                groupId: objGroupId, // IMPORTANT: Set groupId
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

  const findHitObjectIdAt = useCallback((x: number, y: number, options?: { includeImages?: boolean }) => {
    const includeImages = options?.includeImages ?? false;
    // Iterate from topmost (last) to bottom
    for (let i = objects.length - 1; i >= 0; i--) {
      const obj = objects[i];
      const tol = Math.max(6, obj.size);
      
      // Handle images separately
      if (obj.type === 'image' && obj.x !== undefined && obj.y !== undefined && obj.width !== undefined && obj.height !== undefined) {
        if (!includeImages) continue;
        const minX = obj.x - tol;
        const minY = obj.y - tol;
        const maxX = obj.x + obj.width + tol;
        const maxY = obj.y + obj.height + tol;
        if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
          return obj.id;
        }
        continue;
      }
      if (obj.type === 'stroke' && obj.points && obj.points.length > 1) {
        // Ignore background-color eraser strokes (treat them as holes, not objects)
        const normalizedColor = obj.color.toLowerCase();
        if (normalizedColor === BG_COLORS.dark || normalizedColor === BG_COLORS.light) {
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
      } else if ((obj.type === 'rectangle' || obj.type === 'ellipse' || obj.type === 'circle' || obj.type === 'triangle' || obj.type === 'star' || obj.type === 'parabola') && obj.x !== undefined && obj.y !== undefined && obj.width !== undefined && obj.height !== undefined) {
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
    // Check if user has permission to draw
    if (!canDraw && currentTool !== 'hand' && currentTool !== 'move') {
      toast({
        title: 'View Only',
        description: 'You don\'t have permission to edit this project.',
        variant: 'destructive'
      });
      return;
    }
    
    // Don't start drawing if text input is active
    if (textInputPos) return;
    
    const worldPos = screenToWorld(e.clientX, e.clientY);
    try {
      (e.currentTarget as Element & { setPointerCapture?: (id: number) => void }).setPointerCapture?.(e.pointerId);
    } catch {
      // ignore pointer capture errors
    }
    
    // Move tool: drag objects
    if (currentTool === 'move') {
      const hitId = findHitObjectIdAt(worldPos.x, worldPos.y, { includeImages: true });
      if (hitId) {
        const obj = objects.find(o => o.id === hitId);
        if (obj) {
          // Calculate offset based on object type
          let offsetX = 0;
          let offsetY = 0;
          
          if (obj.x !== undefined && obj.y !== undefined) {
            // For shapes with x,y coordinates
            offsetX = worldPos.x - obj.x;
            offsetY = worldPos.y - obj.y;
          } else if (obj.type === 'stroke' && obj.points && obj.points.length > 0) {
            // For strokes, use the first point as reference
            offsetX = worldPos.x - obj.points[0].x;
            offsetY = worldPos.y - obj.points[0].y;
          }
          
          setDraggedObject({ id: hitId, offsetX, offsetY });
          saveHistory();
          return;
        }
      }
      return;
    }
    
    // Hand tool: pan only
    if (currentTool === 'hand' || isSpacePan) {
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY, viewX, viewY });
      return;
    }

    // Ignore right-click
    if ((e as unknown as MouseEvent).button === 2) {
      return;
    }
    
    if (currentTool === 'eraser' && eraserMode === 'object') {
      const hitId = findHitObjectIdAt(worldPos.x, worldPos.y, { includeImages: true });
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
          } else if ((removed.type === 'line' || removed.type === 'rectangle' || removed.type === 'ellipse' || removed.type === 'circle' || removed.type === 'triangle' || removed.type === 'star' || removed.type === 'parabola' || removed.type === 'image') && removed.x !== undefined && removed.y !== undefined && removed.width !== undefined && removed.height !== undefined) {
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
            } else if ((obj.type === 'line' || obj.type === 'rectangle' || obj.type === 'ellipse' || obj.type === 'circle' || obj.type === 'triangle' || obj.type === 'star' || obj.type === 'parabola' || obj.type === 'image') && obj.x !== undefined && obj.y !== undefined && obj.width !== undefined && obj.height !== undefined) {
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
              const objGroupId = obj.id; // Use object ID as groupId
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
                  groupId: objGroupId, // IMPORTANT: Set groupId
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
            } else if (obj.type === 'image' && obj.x !== undefined && obj.y !== undefined && obj.width !== undefined && obj.height !== undefined) {
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
      // ALWAYS generate a unique groupId for each stroke session
      // This prevents different strokes from connecting to each other
      strokeGroupRef.current = generateId();
      saveHistory();
    } else if (['line', 'rectangle', 'ellipse', 'star'].includes(currentTool)) {
      setIsDrawing(true);
      setStartPoint(worldPos);
      setLastPoint(worldPos);
      saveHistory();
    } else if (currentTool === 'text') {
      // Text tool: show input at click position
      setTextInputPos({ 
        x: e.clientX, 
        y: e.clientY, 
        worldX: worldPos.x, 
        worldY: worldPos.y 
      });
      setTextInputValue('');
      setTimeout(() => textInputRef.current?.focus(), 0);
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
  }, [currentTool, eraserMode, screenToWorld, saveHistory, findHitObjectIdAt, removeObject, objects, viewX, viewY, isSpacePan, triangleVertices, triangleMode, brushColor, brushSize, brushOpacity, addObject, emitShape, setDraggedObject, textInputPos]);

  const draw = useCallback((e: React.PointerEvent) => {
    // Emit cursor position for live cursors
    const canvas = canvasRef.current;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const worldPos = screenToWorld(screenX, screenY);
      emitCursor(worldPos.x, worldPos.y);
    }
    
    // Handle panning first (before other operations)
    if (isPanning && panStart) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      const rect = canvas.getBoundingClientRect();
      const deltaX = e.clientX - panStart.x;
      const deltaY = e.clientY - panStart.y;
      
      // Calculate new view position based on the ORIGINAL panStart values
      // This prevents accumulating errors from React state updates
      const unconstrained = {
        x: panStart.viewX - deltaX / zoom,
        y: panStart.viewY - deltaY / zoom
      };
      
      // Apply constraints to keep view within world boundaries
      const constrained = constrainView(unconstrained.x, unconstrained.y, zoom, rect.width, rect.height);
      const newViewX = constrained.x;
      const newViewY = constrained.y;
      
      // Store current pan position
      currentPanViewRef.current = { x: newViewX, y: newViewY };
      
      // Throttle BOTH state updates AND worker messages to animation frames
      if (!panViewportScheduledRef.current) {
        panViewportScheduledRef.current = true;
        
        requestAnimationFrame(() => {
          panViewportScheduledRef.current = false;
          
          // Get the latest pan position
          const latestView = currentPanViewRef.current;
          if (!latestView) return;
          
          // Update React state once per frame
          setView(latestView.x, latestView.y);
          
          // Update worker viewport
          const canvas = canvasRef.current;
          if (canvas) {
            const rect = canvas.getBoundingClientRect();
            const dpr = isIOS() ? 1 : (window.devicePixelRatio || 1);
            workerRef.current?.postMessage({
              type: 'viewport',
              zoom,
              viewX: latestView.x,
              viewY: latestView.y,
              canvasWidth: rect.width,
              canvasHeight: rect.height,
              dpr
            });
          }
        });
      }
      return;
    }
    
    // Handle object dragging
    if (draggedObject) {
      const worldPos = screenToWorld(e.clientX, e.clientY);
      const newX = worldPos.x - draggedObject.offsetX;
      const newY = worldPos.y - draggedObject.offsetY;
      
      // Use the ref to get current objects (either from ref during drag or from state)
      const currentObjects = draggedObjectsRef.current || objects;
      const obj = currentObjects.find(o => o.id === draggedObject.id);
      
      if (obj) {
        let updatedObjects;
        
        if (obj.type === 'stroke' && obj.points && obj.points.length > 0) {
          // For strokes, move all points by the delta
          const deltaX = newX - obj.points[0].x;
          const deltaY = newY - obj.points[0].y;
          
          updatedObjects = currentObjects.map(o => 
            o.id === draggedObject.id 
              ? { 
                  ...o, 
                  points: o.points!.map(p => ({ 
                    x: p.x + deltaX, 
                    y: p.y + deltaY 
                  }))
                }
              : o
          );
        } else if (obj.type === 'triangle' && obj.points && obj.points.length > 0) {
          // For triangles with custom points, move both the bounding box AND all points
          const deltaX = newX - (obj.x ?? 0);
          const deltaY = newY - (obj.y ?? 0);
          
          updatedObjects = currentObjects.map(o => 
            o.id === draggedObject.id 
              ? { 
                  ...o, 
                  x: newX, 
                  y: newY,
                  points: o.points!.map(p => ({ 
                    x: p.x + deltaX, 
                    y: p.y + deltaY 
                  }))
                }
              : o
          );
        } else {
          // For shapes with x,y coordinates only (rectangles, circles, etc.)
          updatedObjects = currentObjects.map(o => 
            o.id === draggedObject.id 
              ? { ...o, x: newX, y: newY }
              : o
          );
        }
        
        // Store updated objects in ref during drag (don't trigger React re-renders)
        draggedObjectsRef.current = updatedObjects;
        
        // Send only the updated object to the worker - it will update in place
        // This is MUCH faster than clearing and redrawing everything
        if (!dragRedrawScheduledRef.current) {
          dragRedrawScheduledRef.current = true;
          requestAnimationFrame(() => {
            dragRedrawScheduledRef.current = false;
            
            if (draggedObjectsRef.current) {
              const updatedObj = draggedObjectsRef.current.find(o => o.id === draggedObject.id);
              if (updatedObj) {
                // For strokes, update the consolidated path directly
                if (updatedObj.type === 'stroke' && updatedObj.points && updatedObj.points.length > 1) {
                  // Remove the old consolidated path
                  workerRef.current?.postMessage({ type: 'remove-group', groupId: updatedObj.id });
                  
                  // Add the stroke at new position with the same groupId
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
                      groupId: updatedObj.id, // Use object ID as groupId
                      timestamp: Date.now()
                    });
                  }
                  if (strokes.length) {
                    workerRef.current?.postMessage({ type: 'strokes', data: strokes });
                  }
                } else if ((updatedObj.type === 'line' || updatedObj.type === 'rectangle' || updatedObj.type === 'ellipse' || updatedObj.type === 'circle' || updatedObj.type === 'triangle' || updatedObj.type === 'parabola' || updatedObj.type === 'text' || updatedObj.type === 'image' || updatedObj.type === 'star' || updatedObj.type === 'arrow') && updatedObj.x !== undefined && updatedObj.y !== undefined) {
                  // Send just this one shape - worker will update it in place and redraw
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
                    orientation: (updatedObj as { orientation?: 'up' | 'down' | 'left' | 'right' }).orientation,
                    text: updatedObj.text,
                    fontSize: updatedObj.fontSize,
                    imageData: updatedObj.imageData,
                    points: updatedObj.points, // Include points for custom triangles
                    properties: updatedObj.properties, // Include properties for stars, etc.
                    timestamp: Date.now()
                  };
                  workerRef.current?.postMessage({ type: 'shape', data: shape });
                }
              }
            }
          });
        }
      }
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
        // Ensure groupId is always set - if not set, skip this stroke
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
          groupId: strokeGroupRef.current // REQUIRED - must always be set
        };
        enqueueWorkerStroke(stroke);
        setCurrentStroke(prev => [...prev, stroke]);
        lp = p;
      }
      if (lp) setLastPoint(lp);
    } else if (['line', 'rectangle', 'ellipse', 'star'].includes(currentTool) && startPoint) {
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
  }, [isDrawing, lastPoint, startPoint, currentTool, eraserMode, screenToWorld, brushColor, brushSize, brushOpacity, enqueueWorkerStroke, constrainShape, isPanning, panStart, zoom, setView, triangleMode, draggedObject, objects, theme]);

  const stopDrawing = useCallback(() => {
    // Stop dragging
    if (draggedObject) {
      // Apply the final dragged objects to state
      if (draggedObjectsRef.current) {
        setObjects(draggedObjectsRef.current);
        draggedObjectsRef.current = null;
      }
      setDraggedObject(null);
      
      // Schedule final redraw after state update
      requestAnimationFrame(() => {
        requestFullRedraw();
      });
      return;
    }
    
    // Stop panning (hand tool, space-pan, or right-click pan)
    if (isPanning || currentTool === 'hand' || isSpacePan) {
      // Commit the final pan position to React state
      if (currentPanViewRef.current) {
        setView(currentPanViewRef.current.x, currentPanViewRef.current.y);
        currentPanViewRef.current = null;
      }
      setIsPanning(false);
      setPanStart(null);
      // Only return early if we weren't also drawing
      if (currentTool === 'hand' || isSpacePan || !isDrawing) {
        return;
      }
    }
    if (!isDrawing) return;
    flushWorkerStrokes();

    if (currentTool === 'pen' || (currentTool === 'eraser' && eraserMode === 'partial')) {
      if (currentStroke.length > 0) {
        // Optionally convert to shape if autoShape enabled and tool is pen (feature must be enabled)
        if (FEATURES.AUTO_SHAPE && autoShape && currentTool === 'pen') {
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
              color: BG_COLORS[theme],
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
            // Fallback to stroke object (only for pen with autoShape when no shape detected)
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
            color: currentTool === 'eraser' ? BG_COLORS[theme] : brushColor,
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
    } else if (currentTool === 'star' && startPoint && previewShape) {
      // Create star shape - centered on start point, radius extends to cursor
      const dx = previewShape.endX - startPoint.x;
      const dy = previewShape.endY - startPoint.y;
      const outerRadius = Math.sqrt(dx * dx + dy * dy);
      
      // Calculate bounding box from center and radius
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
          pointCount: starPoints
        }
      };
      
      addObject(starObject);
      
      // Send star to worker for drawing
      workerRef.current?.postMessage({ 
        type: 'shape', 
        data: starObject 
      });
      
      // Emit star to other users
      emitShape({
        ...starObject,
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
  }, [isDrawing, currentStroke, currentTool, eraserMode, brushColor, brushSize, brushOpacity, addObject, startPoint, previewShape, emitShape, emitSnapshot, flushWorkerStrokes, autoShape, detectShapeFromStroke, triangleMode, calculateTriangleVertices, draggedObject, isPanning, isSpacePan, setView, requestFullRedraw, starPoints, theme, setObjects]);


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
      
      // Calculate new view position (zoom towards cursor)
      const unconstrained = {
        x: worldX - mouseX / newZoom,
        y: worldY - mouseY / newZoom
      };
      
      // Apply constraints to keep view within world boundaries
      const constrained = constrainView(unconstrained.x, unconstrained.y, newZoom, rect.width, rect.height);
      
      setZoom(newZoom);
      setView(constrained.x, constrained.y);
      // Push viewport immediately to worker for accurate blit
      const dpr = isIOS() ? 1 : (window.devicePixelRatio || 1);
      workerRef.current?.postMessage({
        type: 'viewport',
        zoom: newZoom,
        viewX: constrained.x,
        viewY: constrained.y,
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
    
    // Calculate new view position (zoom towards center)
    const unconstrained = {
      x: worldX - centerX / newZoom,
      y: worldY - centerY / newZoom
    };
    
    // Apply constraints to keep view within world boundaries
    const constrained = constrainView(unconstrained.x, unconstrained.y, newZoom, rect.width, rect.height);
    
    setZoom(newZoom);
    setView(constrained.x, constrained.y);
    const dpr = isIOS() ? 1 : (window.devicePixelRatio || 1);
    workerRef.current?.postMessage({
      type: 'viewport',
      zoom: newZoom,
      viewX: constrained.x,
      viewY: constrained.y,
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

  // Handle pointer enter to refresh viewport (helps with tab switching and window manager issues)
  const handlePointerEnter = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // Refresh viewport when pointer enters canvas
    // This ensures coordinates are correct after tab switches or window movements
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
  }, [zoom, viewX, viewY]);

  return (
    <div className={`w-full h-full relative overflow-hidden ${theme === 'dark' ? 'bg-[#0a0a0a]' : 'bg-[#e0e0e0]'}`}>
        <canvas
          ref={canvasRef}
          className={`absolute inset-0 w-full h-full touch-none ${(currentTool === 'hand' || isSpacePan || isPanning) ? (isPanning ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-crosshair'}`}
          onPointerEnter={handlePointerEnter}
          onPointerDown={startDrawing}
          onPointerMove={draw}
          onPointerUp={stopDrawing}
          onPointerLeave={stopDrawing}
          onWheel={handleWheel}
          onContextMenu={(e) => e.preventDefault()}
        />
        
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
          <Button
            onClick={handleResetView}
            variant="glass"
            size="sm"
            title="Reset view"
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
          
          {/* FPS Counter - visible in dev mode */}
          {import.meta.env.DEV && (
            <div 
              className={`px-2 py-1 glass rounded text-xs font-mono ${
                fps >= 55 ? 'text-green-500' : fps >= 30 ? 'text-yellow-500' : 'text-red-500'
              }`}
              title="Frames per second"
            >
              {fps} FPS
            </div>
          )}
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
                  if (previewShape.type === 'star') {
                    // Star expands from start point (center) to cursor position
                    const centerX = (previewShape.startX - viewX) * zoom;
                    const centerY = (previewShape.startY - viewY) * zoom;
                    const dx = (previewShape.endX - previewShape.startX) * zoom;
                    const dy = (previewShape.endY - previewShape.startY) * zoom;
                    const outerRadius = Math.sqrt(dx * dx + dy * dy);
                    const innerRadius = outerRadius * 0.38;
                    const pointCount = starPoints;
                    
                    if (outerRadius < 5) return null; // Too small to draw
                    
                    const starPointsArr: string[] = [];
                    for (let i = 0; i < pointCount * 2; i++) {
                      const angle = (i * Math.PI / pointCount) - Math.PI / 2;
                      const radius = i % 2 === 0 ? outerRadius : innerRadius;
                      starPointsArr.push(`${centerX + radius * Math.cos(angle)},${centerY + radius * Math.sin(angle)}`);
                    }
                    return <polygon points={starPointsArr.join(' ')} fill="none" stroke="#60a5fa" strokeWidth="2" strokeDasharray="8,4" opacity="0.6" />;
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
        
        {/* Text Input */}
        {textInputPos && (
          <textarea
            ref={textInputRef}
            value={textInputValue}
            onChange={(e) => setTextInputValue(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              // Ctrl/Cmd+Enter to submit, Escape to cancel
              if ((e.key === 'Enter' && (e.ctrlKey || e.metaKey)) && textInputValue.trim()) {
                e.preventDefault();
                const text = textInputValue.trim();
                const fontSize = Math.max(16, brushSize * 2);
                const ctx = document.createElement('canvas').getContext('2d');
                ctx!.font = `${fontSize}px Inter, system-ui, sans-serif`;
                
                // Calculate dimensions for multi-line text
                const lines = text.split('\n');
                const maxWidth = Math.max(...lines.map(line => ctx!.measureText(line).width));
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
                  height
                };
                
                saveHistory();
                addObject(textObj);
                workerRef.current?.postMessage({ 
                  type: 'shape', 
                  data: { ...textObj, timestamp: Date.now() } 
                });
                emitShape({ ...textObj, timestamp: Date.now() } as ShapeData);
                
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
              }
            }}
          />
        )}
        
        {/* Keyboard shortcuts dialog - opened by ? key */}
        <ShortcutsDialog 
          mode="draw" 
          open={showShortcuts} 
          onOpenChange={setShowShortcuts}
          showTrigger={false}
        />
        
        {/* Hidden file input for image upload */}
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
