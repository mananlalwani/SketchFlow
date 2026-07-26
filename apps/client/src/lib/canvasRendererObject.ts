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
      // Keep a stroke in the same retained scene sequence as shapes. The
      // worker's old separate stroke pass made every shape visually topmost,
      // even when the Layers panel placed a stroke above it.
      shapes.push({
        id: object.id,
        type: 'stroke',
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        color: object.color,
        size: object.size,
        alpha: object.alpha ?? 1,
        points: object.points,
        properties: { hidden: object.hidden ?? false },
        timestamp: object.createdAt ?? 0,
      });
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
      properties: {
        ...object.properties,
        rotation: object.rotation ?? 0,
        hidden: object.hidden ?? false,
      },
      timestamp: object.createdAt ?? 0,
    });
  }

  return { shapes, strokes };
}
