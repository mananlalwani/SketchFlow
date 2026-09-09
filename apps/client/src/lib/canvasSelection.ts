import type { DrawingObject } from '@/store/drawingStore';
import { getObjectBounds } from '@/lib/canvasObjectGeometry';
import { compareCanvasObjects } from './canvasObjectOrder';
import { getStrokePointWidth } from './canvasRendererCommands';

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

function inverseRotatePoint(x: number, y: number, object: DrawingObject) {
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
  const orderedObjects = objects
    .map((object, index) => ({ object, index }))
    .sort(compareCanvasObjects);
  for (let index = orderedObjects.length - 1; index >= 0; index--) {
    const object = orderedObjects[index].object;
    if (object.hidden) continue;
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
    if (object.type === 'stroke' && object.points?.length) {
      if (['#020617', '#f8fafc', '#0a0a0a', '#e0e0e0'].includes(object.color.toLowerCase()))
        continue;
      if (object.points.length === 1) {
        const strokePoint = object.points[0];
        const radius = getStrokePointWidth(strokePoint, object.size) / 2;
        if (Math.hypot(point.x - strokePoint.x, point.y - strokePoint.y) <= Math.max(6, radius)) {
          return object.id;
        }
        continue;
      }
      for (let pointIndex = 0; pointIndex < object.points.length - 1; pointIndex++) {
        const start = object.points[pointIndex];
        const end = object.points[pointIndex + 1];
        const strokeTolerance = Math.max(
          6,
          getStrokePointWidth(start, object.size) / 2,
          getStrokePointWidth(end, object.size) / 2,
        );
        if (
          distancePointToSegment(point.x, point.y, start.x, start.y, end.x, end.y) <=
          strokeTolerance
        )
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
        point.y >= object.y - tolerance &&
        point.y <= object.y + object.height + tolerance
      )
        return object.id;
    }
  }
  return null;
}

export interface CanvasSelectionRect {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

/**
 * Resolves a rectangular marquee against retained object bounds.
 *
 * A left-to-right marquee uses the conventional "fully inside" behavior. A
 * right-to-left marquee selects any visible object it touches, which is useful
 * for handwriting where a pressure-expanded stroke can extend a few pixels
 * past the box the person drew. Bounds come from the same geometry used by
 * the selection overlay, so variable-pressure strokes keep their real width.
 */
export function findCanvasObjectIdsInSelection(
  objects: readonly DrawingObject[],
  rect: CanvasSelectionRect,
): string[] {
  const left = Math.min(rect.startX, rect.endX);
  const right = Math.max(rect.startX, rect.endX);
  const top = Math.min(rect.startY, rect.endY);
  const bottom = Math.max(rect.startY, rect.endY);
  const contains = rect.endX >= rect.startX;

  return objects
    .filter((object) => {
      if (object.hidden) return false;
      const bounds = getObjectBounds(object);
      if (!bounds) return false;
      const objectRight = bounds.x + bounds.width;
      const objectBottom = bounds.y + bounds.height;
      if (contains) {
        return (
          bounds.x >= left && bounds.y >= top && objectRight <= right && objectBottom <= bottom
        );
      }
      return bounds.x <= right && objectRight >= left && bounds.y <= bottom && objectBottom >= top;
    })
    .map((object) => object.id);
}
