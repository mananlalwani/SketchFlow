import type { DrawingObject } from '@/store/drawingStore';

import type { CanvasPoint } from './canvasPointer';

export interface ObjectDrag {
  id: string;
  offsetX: number;
  offsetY: number;
}

export function getObjectDragOffset(object: DrawingObject, pointer: CanvasPoint): CanvasPoint {
  if (object.x !== undefined && object.y !== undefined) {
    return { x: pointer.x - object.x, y: pointer.y - object.y };
  }
  if (object.type === 'stroke' && object.points?.length) {
    return { x: pointer.x - object.points[0].x, y: pointer.y - object.points[0].y };
  }
  return { x: 0, y: 0 };
}

export function translateDrawingObject(
  object: DrawingObject,
  pointer: CanvasPoint,
  offset: CanvasPoint,
): DrawingObject {
  const x = pointer.x - offset.x;
  const y = pointer.y - offset.y;

  if (object.type === 'stroke' && object.points?.length) {
    const deltaX = x - object.points[0].x;
    const deltaY = y - object.points[0].y;
    return {
      ...object,
      points: object.points.map((point) => ({ x: point.x + deltaX, y: point.y + deltaY })),
    };
  }

  if (object.type === 'triangle' && object.points?.length) {
    const deltaX = x - (object.x ?? 0);
    const deltaY = y - (object.y ?? 0);
    return {
      ...object,
      x,
      y,
      points: object.points.map((point) => ({ x: point.x + deltaX, y: point.y + deltaY })),
    };
  }

  return { ...object, x, y };
}

export function translateObjectInCollection(
  objects: DrawingObject[],
  objectId: string,
  pointer: CanvasPoint,
  offset: CanvasPoint,
): DrawingObject[] {
  return objects.map((object) =>
    object.id === objectId ? translateDrawingObject(object, pointer, offset) : object,
  );
}
