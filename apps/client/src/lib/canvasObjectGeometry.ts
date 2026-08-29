import type { StrokeData } from '@/types/socket';
import type { DrawingObject } from '@/store/drawingStore';
import type { TriangleMode } from './canvasViewport';

export function isTriangleMode(value: string): value is TriangleMode {
  return value === 'right' || value === '45-45-90' || value === '30-60-90';
}

export function pressureAdjustedSize(
  baseSize: number,
  event: Pick<PointerEvent, 'pointerType' | 'pressure'>,
): number {
  if (event.pointerType !== 'pen' || event.pressure <= 0) return baseSize;
  return baseSize * (0.25 + event.pressure * 0.75);
}

export function committedStrokeSize(strokes: StrokeData[], fallback: number): number {
  if (strokes.length === 0) return fallback;
  return strokes.reduce((sum, stroke) => sum + stroke.size, 0) / strokes.length;
}

export function getObjectBounds(object: DrawingObject) {
  if (object.type === 'stroke' && object.points?.length) {
    const xs = object.points.map((point) => point.x);
    const ys = object.points.map((point) => point.y);
    return {
      x: Math.min(...xs) - object.size,
      y: Math.min(...ys) - object.size,
      width: Math.max(...xs) - Math.min(...xs) + object.size * 2,
      height: Math.max(...ys) - Math.min(...ys) + object.size * 2,
    };
  }
  if (
    object.x === undefined ||
    object.y === undefined ||
    object.width === undefined ||
    object.height === undefined
  ) {
    return null;
  }
  if (object.type === 'text') {
    return { x: object.x, y: object.y, width: object.width, height: object.height };
  }
  return {
    x: Math.min(object.x, object.x + object.width),
    y: Math.min(object.y, object.y + object.height),
    width: Math.abs(object.width),
    height: Math.abs(object.height),
  };
}

export function pointInObjectSpace(point: { x: number; y: number }, object: DrawingObject) {
  const x = object.x ?? 0;
  const y = object.y ?? 0;
  const width = object.width ?? 0;
  const height = object.height ?? 0;
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const radians = -((object.rotation ?? 0) * Math.PI) / 180;
  const deltaX = point.x - centerX;
  const deltaY = point.y - centerY;
  return {
    x: centerX + deltaX * Math.cos(radians) - deltaY * Math.sin(radians),
    y: centerY + deltaX * Math.sin(radians) + deltaY * Math.cos(radians),
  };
}
