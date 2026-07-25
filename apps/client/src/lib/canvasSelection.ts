/** Returns the shortest distance between a point and a finite line segment. */
export function distancePointToSegment(
  pointX: number,
  pointY: number,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): number {
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  if (deltaX === 0 && deltaY === 0) {
    return Math.hypot(pointX - startX, pointY - startY);
  }
  const progress = Math.max(
    0,
    Math.min(
      1,
      ((pointX - startX) * deltaX + (pointY - startY) * deltaY) / (deltaX ** 2 + deltaY ** 2),
    ),
  );
  return Math.hypot(pointX - (startX + progress * deltaX), pointY - (startY + progress * deltaY));
}

export function findCanvasObjectIdAt(
  objects: DrawingObject[],
  x: number,
  y: number,
  options?: { includeImages?: boolean },
): string | null {
  const includeImages = options?.includeImages ?? false;
  for (let index = objects.length - 1; index >= 0; index--) {
    const object = objects[index];
    const tolerance = Math.max(6, object.size);
    if (
      object.type === 'image' &&
      object.x !== undefined &&
      object.y !== undefined &&
      object.width !== undefined &&
      object.height !== undefined
    ) {
      if (!includeImages) continue;
      if (
        x >= object.x - tolerance &&
        x <= object.x + object.width + tolerance &&
        y >= object.y - tolerance &&
        y <= object.y + object.height + tolerance
      )
        return object.id;
      continue;
    }
    if (object.type === 'stroke' && object.points && object.points.length > 1) {
      if (['#020617', '#f8fafc', '#0a0a0a', '#e0e0e0'].includes(object.color.toLowerCase()))
        continue;
      for (let pointIndex = 0; pointIndex < object.points.length - 1; pointIndex++) {
        const start = object.points[pointIndex];
        const end = object.points[pointIndex + 1];
        if (distancePointToSegment(x, y, start.x, start.y, end.x, end.y) <= tolerance)
          return object.id;
      }
    } else if (
      object.type === 'line' &&
      object.x !== undefined &&
      object.y !== undefined &&
      object.width !== undefined &&
      object.height !== undefined
    ) {
      if (
        distancePointToSegment(
          x,
          y,
          object.x,
          object.y,
          object.x + object.width,
          object.y + object.height,
        ) <= tolerance
      )
        return object.id;
    } else if (
      ['rectangle', 'ellipse', 'circle', 'triangle', 'star', 'parabola'].includes(object.type) &&
      object.x !== undefined &&
      object.y !== undefined &&
      object.width !== undefined &&
      object.height !== undefined
    ) {
      if (
        x >= Math.min(object.x, object.x + object.width) - tolerance &&
        x <= Math.max(object.x, object.x + object.width) + tolerance &&
        y >= Math.min(object.y, object.y + object.height) - tolerance &&
        y <= Math.max(object.y, object.y + object.height) + tolerance
      )
        return object.id;
    } else if (
      object.type === 'text' &&
      object.x !== undefined &&
      object.y !== undefined &&
      object.width !== undefined &&
      object.height !== undefined
    ) {
      if (
        x >= object.x - tolerance &&
        x <= object.x + object.width + tolerance &&
        y >= object.y - object.height / 2 - tolerance &&
        y <= object.y + object.height / 2 + tolerance
      )
        return object.id;
    }
  }
  return null;
}
import type { DrawingObject } from '@/store/drawingStore';
