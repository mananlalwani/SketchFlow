import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useCanvasRendererFallback } from '@/hooks/useCanvasRendererFallback';
import { useCanvasRendererWorker } from '@/hooks/useCanvasRendererWorker';
import { CanvasPresentation } from '@/lib/canvasPresentation';
import { drawingObjectsToRendererScene } from '@/lib/canvasRendererObject';
import { CANVAS_BG_COLORS, type CanvasThemeName } from '@/lib/canvasTheme';
import { WORLD_HEIGHT, WORLD_WIDTH } from '@/lib/canvasViewport';
import type { DrawingObject } from '@/store/drawingStore';

interface UseCanvasRendererRuntimeOptions {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  objects: DrawingObject[];
  zoom: number;
  viewX: number;
  viewY: number;
  theme: CanvasThemeName;
  currentProjectId: string | null | undefined;
  needsFullRedraw: boolean;
  clearFullRedraw: () => void;
  setView: (x: number, y: number) => void;
}

export function useCanvasRendererRuntime({
  canvasRef,
  objects,
  zoom,
  viewX,
  viewY,
  theme,
  currentProjectId,
  needsFullRedraw,
  clearFullRedraw,
  setView,
}: UseCanvasRendererRuntimeOptions) {
  const workerRef = useRef<Worker | null>(null);
  const presentation = useMemo(
    () =>
      new CanvasPresentation({
        send: (message) => workerRef.current?.postMessage(message),
      }),
    [],
  );
  const rendererStatus = useCanvasRendererWorker(
    canvasRef,
    workerRef,
    { zoom, viewX, viewY },
    theme,
  );
  useEffect(() => {
    if (rendererStatus === 'ready' || rendererStatus === 'fallback') presentation.markReady();
    else presentation.markUnavailable();
  }, [presentation, rendererStatus]);
  useCanvasRendererFallback(
    canvasRef,
    rendererStatus === 'fallback',
    objects,
    { zoom, viewX, viewY },
    CANVAS_BG_COLORS[theme],
  );
  useEffect(() => () => presentation.dispose(), [presentation]);

  useEffect(() => {
    if (!needsFullRedraw) return;
    const scene = drawingObjectsToRendererScene(objects);
    presentation.loadScene(`scene-${currentProjectId ?? 'local'}-${objects.length}`, [
      ...scene.drawings,
      ...scene.strokes,
    ]);
    clearFullRedraw();
  }, [needsFullRedraw, clearFullRedraw, currentProjectId, objects, presentation]);

  const initializedRef = useRef(false);
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    setView(WORLD_WIDTH / 2 - rect.width / 2, WORLD_HEIGHT / 2 - rect.height / 2);
  }, [canvasRef, setView]);

  return { workerRef, presentation, rendererStatus };
}
