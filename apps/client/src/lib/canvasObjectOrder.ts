import type { DrawingObject } from './drawingObjectSchema';

/**
 * Resolves the retained canvas order. Older documents have no zIndex, so their
 * array position remains the stable fallback. The original position also
 * breaks ties when two persisted zIndexes are equal.
 */
export function canvasObjectOrder(object: DrawingObject, index: number): number {
  return object.zIndex ?? index;
}

export function compareCanvasObjects(
  left: { object: DrawingObject; index: number },
  right: { object: DrawingObject; index: number },
): number {
  return (
    canvasObjectOrder(left.object, left.index) - canvasObjectOrder(right.object, right.index) ||
    left.index - right.index
  );
}

export function sortCanvasObjects(objects: readonly DrawingObject[]): DrawingObject[] {
  return objects
    .map((object, index) => ({ object, index }))
    .sort(compareCanvasObjects)
    .map(({ object }) => object);
}
