import { describe, expect, it } from 'vitest';

import { drawingObjectsToRendererScene } from '@/lib/canvasRendererObject';

describe('drawingObjectsToRendererScene', () => {
  it('keeps strokes and shapes in object order without losing shape fields', () => {
    const scene = drawingObjectsToRendererScene([
      {
        id: 'stroke-1',
        type: 'stroke',
        color: '#123456',
        size: 3,
        alpha: 0.5,
        points: [
          { x: 1, y: 2 },
          { x: 3, y: 4, pressure: 0.2, width: 1 },
          { x: 5, y: 6 },
        ],
      },
      {
        id: 'triangle-1',
        type: 'triangle',
        x: 10,
        y: 20,
        width: 30,
        height: 40,
        color: '#abcdef',
        size: 2,
        rotation: 45,
        points: [{ x: 10, y: 20 }],
        orientation: 'up',
      },
    ]);

    expect(scene.strokes).toHaveLength(0);
    expect(scene.shapes).toEqual([
      expect.objectContaining({
        id: 'stroke-1',
        type: 'stroke',
        points: [
          { x: 1, y: 2 },
          { x: 3, y: 4, pressure: 0.2, width: 1 },
          { x: 5, y: 6 },
        ],
      }),
      expect.objectContaining({
        id: 'triangle-1',
        points: [{ x: 10, y: 20 }],
        orientation: 'up',
        properties: { hidden: false, rotation: 45 },
      }),
    ]);
  });

  it('uses persistent z-indexes when collaboration preserves objects by ID', () => {
    const scene = drawingObjectsToRendererScene([
      {
        id: 'visually-top',
        type: 'rectangle',
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        color: '#111111',
        size: 1,
        zIndex: 10,
      },
      {
        id: 'visually-bottom',
        type: 'rectangle',
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        color: '#222222',
        size: 1,
        zIndex: 0,
      },
    ]);

    expect(scene.shapes.map((shape) => shape.id)).toEqual(['visually-bottom', 'visually-top']);
  });
});
