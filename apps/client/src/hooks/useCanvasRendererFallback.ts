import { useEffect } from 'react';
import type { RefObject } from 'react';
import type { DrawingObject } from '@/store/drawingStore';
import { drawRendererObject } from '@/lib/canvasRendererCommands';

/** Small retained-mode renderer used only when OffscreenCanvas cannot transfer. */
export function useCanvasRendererFallback(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  enabled: boolean,
  objects: readonly DrawingObject[],
  viewport: { zoom: number; viewX: number; viewY: number },
  background: string,
) {
  useEffect(() => {
    if (!enabled) return;
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const imageCache = new Map<string, HTMLImageElement>();

    const render = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.fillStyle = background;
      context.fillRect(0, 0, rect.width, rect.height);
      context.save();
      context.translate(-viewport.viewX * viewport.zoom, -viewport.viewY * viewport.zoom);
      context.scale(viewport.zoom, viewport.zoom);
      context.lineCap = 'round';
      context.lineJoin = 'round';
      for (const object of objects) {
        if (object.hidden) continue;
        if (
          object.type === 'image' &&
          object.imageData &&
          object.x !== undefined &&
          object.y !== undefined
        ) {
          let image = imageCache.get(object.imageData);
          if (!image) {
            image = new Image();
            image.onload = render;
            image.src = object.imageData;
            imageCache.set(object.imageData, image);
          } else if (image.complete && image.naturalWidth > 0) {
            context.save();
            context.globalAlpha = object.alpha ?? 1;
            if (object.rotation) {
              context.translate(
                object.x + (object.width ?? 0) / 2,
                object.y + (object.height ?? 0) / 2,
              );
              context.rotate((object.rotation * Math.PI) / 180);
              context.translate(
                -(object.x + (object.width ?? 0) / 2),
                -(object.y + (object.height ?? 0) / 2),
              );
            }
            context.drawImage(image, object.x, object.y, object.width ?? 0, object.height ?? 0);
            context.restore();
          }
          continue;
        }
        drawRendererObject(context, object);
      }
      context.restore();
      context.globalAlpha = 1;
    };
    render();
    const observer = new ResizeObserver(render);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [background, canvasRef, enabled, objects, viewport.viewX, viewport.viewY, viewport.zoom]);
}
