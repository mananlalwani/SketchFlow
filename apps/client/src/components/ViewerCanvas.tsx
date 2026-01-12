import { useRef, useEffect, useCallback, useState } from 'react';
import { useDrawingStore } from '@/store/drawingStore';
import { useDrawingSocket } from '@/hooks/useSocket';
import { usePerformanceMonitor } from '@/hooks/usePerformanceMonitor';
import { useTheme } from '@/contexts/ThemeContext';
import { isIOS } from '@/lib/utils';
import { useFPSCounter } from '@/hooks/useFPSCounter';
import type { StrokeData, ShapeData, CanvasSnapshot } from '@/types/socket';
import { LiveCursors } from './LiveCursors';
import { useLiveCursors } from '@/hooks/useLiveCursors';

const WORLD_WIDTH = 51200;  // 20x 1440p width (2560 × 20)
const WORLD_HEIGHT = 28800; // 20x 1440p height (1440 × 20)

export function ViewerCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const {
    zoom,
    viewX,
    viewY,
    updatePerformanceStats,
    setZoom,
    setView,
    currentProjectId,
  } = useDrawingStore();

  const objectsLength = useDrawingStore(state => state.objects.length);

  const { on } = useDrawingSocket();
  const { cursors, emitCursor } = useLiveCursors(currentProjectId ?? null);
  const { metrics, updateMetrics, shouldSkipFrame } = usePerformanceMonitor();
  const liveFps = useFPSCounter();
  const { theme } = useTheme();

  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number; viewX: number; viewY: number } | null>(null);

  // Worker-based renderer
  const workerRef = useRef<Worker | null>(null);

  // Setup canvas + worker
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (!workerRef.current) {
      try {
        const worker = new Worker(new URL('../workers/rendererWorker.ts', import.meta.url), { type: 'module' });
        workerRef.current = worker;
        
        // Check if OffscreenCanvas is supported
        if ('transferControlToOffscreen' in canvas) {
          const offscreen = canvas.transferControlToOffscreen();
          worker.postMessage({ type: 'init', canvas: offscreen, worldWidth: WORLD_WIDTH, worldHeight: WORLD_HEIGHT }, [offscreen]);
        } else {
          // Fallback: use regular canvas context
          console.warn('OffscreenCanvas not supported, using fallback rendering');
          worker.postMessage({ type: 'init-fallback', worldWidth: WORLD_WIDTH, worldHeight: WORLD_HEIGHT });
        }
      } catch (error) {
        console.error('Worker initialization failed:', error);
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
     
  }, [zoom, viewX, viewY]);

  // Send theme to worker when it changes
  useEffect(() => {
    if (!workerRef.current) return;
    const bgColor = theme === 'dark' ? '#020617' : '#f8fafc';
    workerRef.current.postMessage({ type: 'theme', bgColor });
  }, [theme]);

  // Trigger full redraw when objects change
  useEffect(() => {
    const objects = useDrawingStore.getState().objects;
    if (objects.length > 0 && workerRef.current) {
      // Send all objects to worker for rendering
      const shapes = objects.map(obj => ({
        id: obj.id,
        type: obj.type,
        x: obj.x,
        y: obj.y,
        width: obj.width,
        height: obj.height,
        color: obj.color,
        size: obj.size,
        alpha: obj.alpha,
        points: obj.points,
        text: obj.text,
        fontSize: obj.fontSize,
        filled: obj.filled,
        orientation: obj.orientation,
        imageData: obj.imageData
      }));
      workerRef.current.postMessage({ type: 'load-objects', data: shapes });
    }
  }, [objectsLength]);

  // Also listen for needsFullRedraw flag
  useEffect(() => {
    let prevNeedsRedraw = useDrawingStore.getState().needsFullRedraw;
    const unsubscribe = useDrawingStore.subscribe((state) => {
      const needsRedraw = state.needsFullRedraw;
      if (needsRedraw && needsRedraw !== prevNeedsRedraw && workerRef.current) {
        const objects = useDrawingStore.getState().objects;
        const shapes = objects.map(obj => ({
          id: obj.id,
          type: obj.type,
          x: obj.x,
          y: obj.y,
          width: obj.width,
          height: obj.height,
          color: obj.color,
          size: obj.size,
          alpha: obj.alpha,
          points: obj.points,
          text: obj.text,
          fontSize: obj.fontSize,
          filled: obj.filled,
          orientation: obj.orientation,
          imageData: obj.imageData
        }));
        workerRef.current.postMessage({ type: 'load-objects', data: shapes });
      }
      prevNeedsRedraw = needsRedraw;
    });
    return () => unsubscribe();
  }, []);

  // Track frame metrics only; drawing is off-thread
  const render = useCallback(() => {
    const frameStart = performance.now();
    if (shouldSkipFrame) return;
    const frameEnd = performance.now();
    updateMetrics(frameStart, frameEnd);
    updatePerformanceStats(liveFps, 0);
  }, [shouldSkipFrame, updateMetrics, liveFps, updatePerformanceStats]);

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

  // Socket event handlers for live updates
  useEffect(() => {
    const drawStrokeToWorld = (stroke: StrokeData) => {
      workerRef.current?.postMessage({ type: 'stroke', data: stroke });
    };

    const unsubscribeStroke = on('draw:stroke', drawStrokeToWorld);

    const unsubscribeStrokes = on('draw:strokes', (strokes: StrokeData[]) => {
      workerRef.current?.postMessage({ type: 'strokes', data: strokes });
    });

    const unsubscribeShape = on('draw:shape', (shape: ShapeData) => {
      workerRef.current?.postMessage({ type: 'shape', data: shape });
    });

    const unsubscribeSnapshot = on('canvas:snapshot', (snapshot: CanvasSnapshot) => {
      if (!snapshot?.dataUrl) return;
      if (isIOS()) return;
      
      if (useDrawingStore.getState().objectCount > 0) return;
      
      workerRef.current?.postMessage({ 
        type: 'snapshot-image', 
        dataUrl: snapshot.dataUrl, 
        worldWidth: snapshot.worldW ?? WORLD_WIDTH, 
        worldHeight: snapshot.worldH ?? WORLD_HEIGHT 
      });
    });

    const unsubscribeClear = on('canvas:clear', () => {
      workerRef.current?.postMessage({ type: 'clear' });
    });

    return () => {
      unsubscribeStroke();
      unsubscribeStrokes();
      unsubscribeShape();
      unsubscribeSnapshot();
      unsubscribeClear();
    };
  }, [on]);

  // Zoom handlers
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 1.1 : 0.9;
    const newZoom = Math.max(0.1, Math.min(5, zoom * delta));
    
    const canvas = canvasRef.current;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      const worldX = viewX + mouseX / zoom;
      const worldY = viewY + mouseY / zoom;
      
      const newViewX = worldX - mouseX / newZoom;
      const newViewY = worldY - mouseY / newZoom;
      
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
    }
  }, [zoom, viewX, viewY, setZoom, setView]);

  // Pan handlers
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    setIsPanning(true);
    setPanStart({
      x: e.clientX,
      y: e.clientY,
      viewX,
      viewY
    });
  }, [viewX, viewY]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    // Emit cursor position for live cursors (viewers can show cursor but not draw)
    const canvas = canvasRef.current;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const worldX = viewX + screenX / zoom;
      const worldY = viewY + screenY / zoom;
      emitCursor(worldX, worldY);
    }
    
    if (!isPanning || !panStart) return;

    const now = performance.now();
    const anyMove = handlePointerMove as unknown as { lastUpdate?: number };
    if (metrics.adaptiveQuality === 'low' && typeof anyMove.lastUpdate === 'number' && now - anyMove.lastUpdate < 50) return;
    if (metrics.adaptiveQuality === 'medium' && typeof anyMove.lastUpdate === 'number' && now - anyMove.lastUpdate < 20) return;
    
    anyMove.lastUpdate = now;

    const deltaX = e.clientX - panStart.x;
    const deltaY = e.clientY - panStart.y;
    
    const newViewX = Math.max(0, Math.min(WORLD_WIDTH, panStart.viewX - deltaX / zoom));
    const newViewY = Math.max(0, Math.min(WORLD_HEIGHT, panStart.viewY - deltaY / zoom));
    
    setView(newViewX, newViewY);
  }, [isPanning, panStart, zoom, setView, metrics.adaptiveQuality, viewX, viewY, emitCursor]);

  const handlePointerUp = useCallback(() => {
    setIsPanning(false);
    setPanStart(null);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const state = useDrawingStore.getState();

      const target = e.target as HTMLElement | null;
      const isEditable = !!(target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        (target as unknown as { isContentEditable?: boolean }).isContentEditable
      ));

      if (isEditable) return;

      if (e.ctrlKey || e.metaKey) {
        if (e.key === '=' || e.key === '+') {
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
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <div className="w-full h-full relative overflow-hidden bg-transparent">
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 h-full w-full touch-none transition-colors duration-300 ${
          isPanning ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onWheel={handleWheel}
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
    </div>
  );
}
