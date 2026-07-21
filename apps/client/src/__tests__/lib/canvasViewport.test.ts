import { describe, expect, it } from 'vitest';
import { calculateTriangleVertices, constrainView, WORLD_HEIGHT, WORLD_WIDTH } from '@/lib/canvasViewport';

describe('canvas viewport helpers', () => {
  it('keeps a viewport within the world bounds', () => {
    expect(constrainView(-20, 999999, 1, 100, 100)).toEqual({ x: 0, y: WORLD_HEIGHT - 100 });
    expect(constrainView(999999, 999999, 1, 100, 100)).toEqual({ x: WORLD_WIDTH - 100, y: WORLD_HEIGHT - 100 });
  });

  it('creates constrained triangle vertices deterministically', () => {
    expect(calculateTriangleVertices(0, 0, 30, 10, '45-45-90')).toEqual([
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 },
    ]);
    expect(calculateTriangleVertices(0, 0, 30, 10, 'right')).toEqual([
      { x: 0, y: 0 }, { x: 30, y: 0 }, { x: 0, y: 10 },
    ]);
  });
});
