import type { DrawingObject } from '@/store/drawingStore';
import type { DrawingData } from '@/types/socket';
import { pressureAdjustedSize } from '@/lib/canvasObjectGeometry';

export interface FreehandStrokePoint {
  x: number;
  y: number;
  pressure?: number;
  width?: number;
}

/** Builds the retained object used by both pen and highlighter strokes. */
export function createFreehandStrokeObject(input: {
  id: string;
  points: readonly FreehandStrokePoint[];
  color: string;
  size: number;
  alpha: number;
}): DrawingObject {
  return {
    id: input.id,
    type: 'stroke',
    points: input.points.map((point) => ({ ...point })),
    color: input.color,
    size: input.size,
    alpha: input.alpha,
  };
}

/** Builds a retained dot from a tap, preserving stylus pressure when available. */
export function createFreehandTapObject(input: {
  id: string;
  x: number;
  y: number;
  baseSize: number;
  pointerType: string;
  pressure: number;
  color: string;
  alpha: number;
}): DrawingObject {
  const size = pressureAdjustedSize(input.baseSize, {
    pointerType: input.pointerType,
    pressure: input.pressure,
  });
  return createFreehandStrokeObject({
    id: input.id,
    points: [{ x: input.x, y: input.y, pressure: input.pressure, width: size }],
    color: input.color,
    size,
    alpha: input.alpha,
  });
}

/** Converts a retained stroke into the renderer's ordered-scene shape payload. */
export function toRetainedStrokeData(object: DrawingObject): DrawingData {
  if (object.type !== 'stroke') throw new Error('Expected a stroke object');
  return {
    id: object.id,
    type: 'stroke',
    x: object.x ?? 0,
    y: object.y ?? 0,
    width: object.width ?? 0,
    height: object.height ?? 0,
    color: object.color,
    size: object.size,
    alpha: object.alpha ?? 1,
    points: object.points,
    properties: object.properties,
  };
}
