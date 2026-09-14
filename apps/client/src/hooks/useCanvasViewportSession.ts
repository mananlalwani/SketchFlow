import { useCallback, useEffect, type RefObject } from 'react';
import type { CanvasPresentation } from '@/lib/canvasPresentation';
import {
  panViewportBy,
  publishCanvasViewport,
  zoomViewportAtPoint,
} from '@/lib/canvasViewport';

interface UseCanvasViewportSessionOptions {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  presentation: CanvasPresentation;
  zoom: number;
  viewX: number;
  viewY: number;
  setZoom: (zoom: number) => void;
  setView: (x: number, y: number) => void;
  resetView: () => void;
}

export function useCanvasViewportSession({
  canvasRef,
  presentation,
  zoom,
  viewX,
  viewY,
  setZoom,
  setView,
  resetView,
}: UseCanvasViewportSessionOptions) {
  const apply = useCallback(
    (next: { zoom: number; x: number; y: number }) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      setZoom(next.zoom);
      setView(next.x, next.y);
      publishCanvasViewport(presentation, canvas, next);
    },
    [canvasRef, presentation, setView, setZoom],
  );

  const applyPan = useCallback(
    (next: { x: number; y: number }) => apply({ zoom, x: next.x, y: next.y }),
    [apply, zoom],
  );

  const panScreenDelta = useCallback(
    (deltaX: number, deltaY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      applyPan(
        panViewportBy({
          zoom,
          viewX,
          viewY,
          deltaX,
          deltaY,
          canvasWidth: rect.width,
          canvasHeight: rect.height,
        }),
      );
    },
    [applyPan, canvasRef, viewX, viewY, zoom],
  );

  const panFromOrigin = useCallback(
    (origin: { viewX: number; viewY: number }, deltaX: number, deltaY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      return panViewportBy({
        zoom,
        viewX: origin.viewX,
        viewY: origin.viewY,
        deltaX,
        deltaY,
        canvasWidth: rect.width,
        canvasHeight: rect.height,
      });
    },
    [canvasRef, zoom],
  );

  const zoomAtClient = useCallback(
    (clientX: number, clientY: number, nextZoom: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      apply(
        zoomViewportAtPoint({
          zoom,
          viewX,
          viewY,
          nextZoom,
          focalX: clientX - rect.left,
          focalY: clientY - rect.top,
          canvasWidth: rect.width,
          canvasHeight: rect.height,
        }),
      );
    },
    [apply, canvasRef, viewX, viewY, zoom],
  );

  const zoomByFactor = useCallback(
    (factor: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      apply(
        zoomViewportAtPoint({
          zoom,
          viewX,
          viewY,
          nextZoom: zoom * factor,
          focalX: rect.width / 2,
          focalY: rect.height / 2,
          canvasWidth: rect.width,
          canvasHeight: rect.height,
        }),
      );
    },
    [apply, canvasRef, viewX, viewY, zoom],
  );

  const reset = useCallback(() => {
    resetView();
    const canvas = canvasRef.current;
    if (!canvas) return;
    publishCanvasViewport(presentation, canvas, { zoom: 1, x: 0, y: 0 });
  }, [canvasRef, presentation, resetView]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const preventDocumentScroll = (event: WheelEvent) => event.preventDefault();
    canvas.addEventListener('wheel', preventDocumentScroll, { passive: false });
    return () => canvas.removeEventListener('wheel', preventDocumentScroll);
  }, [canvasRef]);

  return {
    apply,
    applyPan,
    panScreenDelta,
    panFromOrigin,
    zoomAtClient,
    zoomIn: useCallback(() => zoomByFactor(1.2), [zoomByFactor]),
    zoomOut: useCallback(() => zoomByFactor(1 / 1.2), [zoomByFactor]),
    reset,
  };
}
