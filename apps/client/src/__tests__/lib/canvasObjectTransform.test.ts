import { describe, expect, it } from 'vitest';

import {
  getObjectDragOffset,
  translateDrawingObject,
  translateObjectInCollection,
} from '@/lib/canvasObjectTransform';

describe('canvas object transforms', () => {
  it('moves a shape while retaining its pointer offset', () => {
    const rectangle = {
      id: 'rectangle',
      type: 'rectangle' as const,
      x: 10,
      y: 20,
      width: 30,
      height: 40,
      color: '#000',
      size: 2,
    };
    const offset = getObjectDragOffset(rectangle, { x: 15, y: 28 });

    expect(translateDrawingObject(rectangle, { x: 50, y: 60 }, offset)).toMatchObject({
      x: 45,
      y: 52,
    });
  });

  it('translates every stroke point by the same delta', () => {
    const stroke = {
      id: 'stroke',
      type: 'stroke' as const,
      points: [
        { x: 10, y: 20 },
        { x: 15, y: 25 },
      ],
      color: '#000',
      size: 2,
    };

    expect(translateDrawingObject(stroke, { x: 40, y: 50 }, { x: 2, y: 3 }).points).toEqual([
      { x: 38, y: 47 },
      { x: 43, y: 52 },
    ]);
  });

  it('moves custom triangle vertices and leaves other objects unchanged', () => {
    const triangle = {
      id: 'triangle',
      type: 'triangle' as const,
      x: 10,
      y: 20,
      width: 10,
      height: 10,
      points: [
        { x: 10, y: 20 },
        { x: 20, y: 20 },
        { x: 15, y: 30 },
      ],
      color: '#000',
      size: 2,
    };
    const untouched = {
      id: 'other',
      type: 'rectangle' as const,
      x: 0,
      y: 0,
      color: '#000',
      size: 1,
    };
    const transformed = translateObjectInCollection(
      [triangle, untouched],
      'triangle',
      { x: 30, y: 40 },
      { x: 5, y: 5 },
    );

    expect(transformed[0]).toMatchObject({ x: 25, y: 35 });
    expect(transformed[0].points).toEqual([
      { x: 25, y: 35 },
      { x: 35, y: 35 },
      { x: 30, y: 45 },
    ]);
    expect(transformed[1]).toBe(untouched);
  });
});
