import { useEffect } from 'react';
import type { RefObject } from 'react';
import type { DrawingObject } from '@/store/drawingStore';

/** Small retained-mode renderer used only when OffscreenCanvas cannot transfer. */
export function useCanvasRendererFallback(
  canvasRef: RefObject<HTMLCanvasElement>,
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
        context.globalAlpha = object.alpha ?? 1;
        context.strokeStyle = object.color;
        context.fillStyle = object.color;
        if (object.type === 'stroke' && object.points && object.points.length > 1) {
          for (let index = 1; index < object.points.length; index++) {
            const start = object.points[index - 1];
            const end = object.points[index];
            context.lineWidth = end.width ?? object.size;
            context.beginPath();
            context.moveTo(start.x, start.y);
            context.lineTo(end.x, end.y);
            context.stroke();
          }
          continue;
        }
        if (object.x === undefined || object.y === undefined) continue;
        context.save();
        const rotation = object.rotation ?? 0;
        if (rotation) {
          context.translate(
            object.x + (object.width ?? 0) / 2,
            object.y + (object.height ?? 0) / 2,
          );
          context.rotate((rotation * Math.PI) / 180);
          context.translate(
            -(object.x + (object.width ?? 0) / 2),
            -(object.y + (object.height ?? 0) / 2),
          );
        }
        context.lineWidth = object.size;
        if (object.type === 'ellipse' || object.type === 'circle') {
          context.beginPath();
          context.ellipse(
            object.x + (object.width ?? 0) / 2,
            object.y + (object.height ?? 0) / 2,
            Math.abs(object.width ?? 0) / 2,
            Math.abs(object.height ?? 0) / 2,
            0,
            0,
            Math.PI * 2,
          );
          if (object.filled) context.fill();
          else context.stroke();
        } else if (object.type === 'rectangle') {
          if (object.filled) {
            context.fillRect(object.x, object.y, object.width ?? 0, object.height ?? 0);
          } else {
            context.strokeRect(object.x, object.y, object.width ?? 0, object.height ?? 0);
          }
        } else if (object.type === 'text' && object.text) {
          context.font = `${object.fontSize ?? 16}px sans-serif`;
          context.fillText(object.text, object.x, object.y);
        } else {
          context.beginPath();
          context.moveTo(object.x, object.y);
          context.lineTo(object.x + (object.width ?? 0), object.y + (object.height ?? 0));
          context.stroke();
        }
        context.restore();
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
