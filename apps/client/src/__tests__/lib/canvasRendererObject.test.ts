import { describe, expect, it } from 'vitest';

import { drawingObjectsToRendererScene } from '@/lib/canvasRendererObject';

describe('drawingObjectsToRendererScene', () => {
  it('creates one shape and contiguous stroke segments without losing shape fields', () => {
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
        points: [{ x: 10, y: 20 }],
        orientation: 'up',
      },
    ]);

    expect(scene.strokes).toHaveLength(2);
    expect(scene.strokes[0]).toMatchObject({
      x0: 1,
      y0: 2,
      x1: 3,
      y1: 4,
      size: 1,
      groupId: 'stroke-1',
    });
    expect(scene.shapes).toEqual([
      expect.objectContaining({ id: 'triangle-1', points: [{ x: 10, y: 20 }], orientation: 'up' }),
    ]);
  });
});
