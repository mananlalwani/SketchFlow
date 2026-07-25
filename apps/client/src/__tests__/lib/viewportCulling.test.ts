import { describe, expect, it } from 'vitest';
import { objectIntersectsViewport } from '@/lib/viewportCulling';

describe('viewport culling', () => {
  it('removes off-screen shapes, including shapes with negative dimensions', () => {
    expect(
      objectIntersectsViewport(
        { type: 'rectangle', x: 200, y: 200, width: 20, height: 20 },
        0,
        0,
        100,
        100,
      ),
    ).toBe(false);
    expect(
      objectIntersectsViewport(
        { type: 'line', x: 80, y: 80, width: -40, height: -40 },
        0,
        0,
        100,
        100,
      ),
    ).toBe(true);
  });

  it('uses stroke bounds and a stroke-width margin', () => {
    expect(
      objectIntersectsViewport(
        {
          type: 'stroke',
          size: 10,
          points: [
            { x: 105, y: 50 },
            { x: 115, y: 50 },
          ],
        },
        0,
        0,
        100,
        100,
      ),
    ).toBe(true);
    expect(
      objectIntersectsViewport(
        {
          type: 'stroke',
          points: [
            { x: 120, y: 50 },
            { x: 130, y: 50 },
          ],
        },
        0,
        0,
        100,
        100,
      ),
    ).toBe(false);
  });

  it('culls a 10,000-object board to the visible subset within the frame budget', () => {
    const objects = Array.from({ length: 10_000 }, (_, index) => ({
      type: 'rectangle',
      x: index * 20,
      y: index * 20,
      width: 10,
      height: 10,
    }));
    const started = performance.now();
    const visible = objects.filter((object) => objectIntersectsViewport(object, 0, 0, 500, 500));

    expect(visible).toHaveLength(26);
    expect(performance.now() - started).toBeLessThan(50);
  });
});
