import type { DrawingObject } from '@/store/drawingStore';

export const WORLD_WIDTH = 4096;
export const WORLD_HEIGHT = 4096;

export function triangleVertices(obj: DrawingObject): { x: number; y: number }[] | null {
  if (obj.points?.length === 3) return obj.points;
  if (
    obj.x === undefined ||
    obj.y === undefined ||
    obj.width === undefined ||
    obj.height === undefined
  )
    return null;

  return [
    { x: obj.x + obj.width / 2, y: obj.y },
    { x: obj.x + obj.width, y: obj.y + obj.height },
    { x: obj.x, y: obj.y + obj.height },
  ];
}
