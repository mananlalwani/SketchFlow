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

/** Moves an arbitrary set of retained objects by a world-space delta. */
export function translateObjectsBy(
  objects: DrawingObject[],
  ids: readonly string[],
  deltaX: number,
  deltaY: number,
): DrawingObject[] {
  const selected = new Set(ids);
  return objects.map((object) => {
    if (!selected.has(object.id)) return object;
    if (object.type === 'stroke' && object.points?.length) {
      return {
        ...object,
        points: object.points.map((point) => ({
          ...point,
          x: point.x + deltaX,
          y: point.y + deltaY,
        })),
      };
    }
    return {
      ...object,
      x: object.x === undefined ? undefined : object.x + deltaX,
      y: object.y === undefined ? undefined : object.y + deltaY,
      points:
        object.type === 'triangle' && object.points
          ? object.points.map((point) => ({ ...point, x: point.x + deltaX, y: point.y + deltaY }))
          : object.points,
    };
  });
}

/**
 * A group is intentionally flat: selecting or transforming any member also
 * includes every object with the same group id. Keeping this in the transform
 * layer makes canvas and sidebar actions agree about what a group means.
 */
export function expandObjectIdsWithGroups(
  objects: readonly DrawingObject[],
  ids: readonly string[],
): string[] {
  const selectedIds = new Set(ids);
  const groupIds = new Set(
    objects.flatMap((object) =>
      selectedIds.has(object.id) && object.groupId ? [object.groupId] : [],
    ),
  );

  if (!groupIds.size) return [...selectedIds];

  return objects
    .filter(
      (object) =>
        selectedIds.has(object.id) || Boolean(object.groupId && groupIds.has(object.groupId)),
    )
    .map((object) => object.id);
}
