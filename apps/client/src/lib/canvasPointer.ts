import type { StrokeData, StrokePoint } from '@/types/socket';

export type CanvasPoint = StrokePoint;

export function screenPointToWorld(
  rect: Pick<DOMRect, 'left' | 'top'>,
  viewport: { zoom: number; viewX: number; viewY: number },
  clientX: number,
  clientY: number,
): CanvasPoint {
  return {
    x: viewport.viewX + (clientX - rect.left) / viewport.zoom,
    y: viewport.viewY + (clientY - rect.top) / viewport.zoom,
  };
}

export function constrainShapeEnd(
  start: CanvasPoint,
  end: CanvasPoint,
  shapeType: string,
  constrained: boolean,
): CanvasPoint {
  if (!constrained || (shapeType !== 'rectangle' && shapeType !== 'ellipse')) return end;

  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const size = Math.min(Math.abs(deltaX), Math.abs(deltaY));

  return {
    x: start.x + (deltaX >= 0 ? size : -size),
    y: start.y + (deltaY >= 0 ? size : -size),
  };
}

export function buildStrokePoints(strokes: readonly StrokeData[]): CanvasPoint[] {
  if (strokes.length === 0) return [];
  const first = strokes[0];
  return [
    { x: first.x0, y: first.y0, pressure: first.pressure, width: first.size },
    ...strokes.map((stroke) => ({
      x: stroke.x1,
      y: stroke.y1,
      pressure: stroke.pressure,
      width: stroke.size,
    })),
  ];
}

export function getPointerSamples(event: PointerEvent): PointerEvent[] {
  const samples = event.getCoalescedEvents?.();
  return samples && samples.length ? samples : [event];
}
