import type { DrawingObject } from '@/store/drawingStore';
import type { ShapeData, StrokeData } from '@/types/socket';

export interface RendererScene {
  shapes: ShapeData[];
  strokes: StrokeData[];
}

/** Converts retained drawing objects to the compact worker representation. */
export function drawingObjectsToRendererScene(objects: readonly DrawingObject[]): RendererScene {
  const shapes: ShapeData[] = [];
  const strokes: StrokeData[] = [];

  for (const object of objects) {
    if (object.type === 'stroke') {
      if (!object.points || object.points.length < 2) continue;
      for (let index = 0; index < object.points.length - 1; index++) {
        const start = object.points[index];
        const end = object.points[index + 1];
        strokes.push({
          x0: start.x,
          y0: start.y,
          x1: end.x,
          y1: end.y,
          color: object.color,
          size: end.width ?? object.size,
          alpha: object.alpha ?? 1,
          groupId: object.id,
          timestamp: object.createdAt ?? 0,
        });
      }
      continue;
    }

    if (object.x === undefined || object.y === undefined) continue;
    shapes.push({
      id: object.id,
      type: object.type,
      x: object.x,
      y: object.y,
      width: object.width ?? 0,
      height: object.height ?? 0,
      color: object.color,
      size: object.size,
      alpha: object.alpha ?? 1,
      filled: object.filled,
      orientation: object.orientation,
      text: object.text,
      fontSize: object.fontSize,
      imageData: object.imageData,
      points: object.points,
      properties: { ...object.properties, rotation: object.rotation ?? 0 },
      timestamp: object.createdAt ?? 0,
    });
  }

  return { shapes, strokes };
}
