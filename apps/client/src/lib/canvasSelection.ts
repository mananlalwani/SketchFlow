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

function inverseRotatePoint(x: number, y: number, object: DrawingObject): { x: number; y: number } {
  if (
    !object.rotation ||
    object.x === undefined ||
    object.y === undefined ||
    object.width === undefined ||
    object.height === undefined
  )
    return { x, y };
  const centerX = object.x + object.width / 2;
  const centerY = object.y + object.height / 2;
  const radians = (-object.rotation * Math.PI) / 180;
  const deltaX = x - centerX;
  const deltaY = y - centerY;
  return {
    x: centerX + deltaX * Math.cos(radians) - deltaY * Math.sin(radians),
    y: centerY + deltaX * Math.sin(radians) + deltaY * Math.cos(radians),
  };
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
    const point = inverseRotatePoint(x, y, object);
    if (
      object.type === 'image' &&
      object.x !== undefined &&
      object.y !== undefined &&
      object.width !== undefined &&
      object.height !== undefined
    ) {
      if (!includeImages) continue;
      if (
        point.x >= object.x - tolerance &&
        point.x <= object.x + object.width + tolerance &&
        point.y >= object.y - tolerance &&
        point.y <= object.y + object.height + tolerance
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
        if (distancePointToSegment(point.x, point.y, start.x, start.y, end.x, end.y) <= tolerance)
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
          point.x,
          point.y,
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
        point.x >= Math.min(object.x, object.x + object.width) - tolerance &&
        point.x <= Math.max(object.x, object.x + object.width) + tolerance &&
        point.y >= Math.min(object.y, object.y + object.height) - tolerance &&
        point.y <= Math.max(object.y, object.y + object.height) + tolerance
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
        point.x >= object.x - tolerance &&
        point.x <= object.x + object.width + tolerance &&
        point.y >= object.y - object.height / 2 - tolerance &&
        point.y <= object.y + object.height / 2 + tolerance
      )
        return object.id;
    }
  }
  return null;
}
import type { DrawingObject } from '@/store/drawingStore';
