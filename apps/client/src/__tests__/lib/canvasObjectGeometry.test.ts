import { describe, expect, it } from 'vitest';
import {
  committedStrokeSize,
  getObjectBounds,
  isTriangleMode,
  pointInObjectSpace,
  pressureAdjustedSize,
} from '@/lib/canvasObjectGeometry';

describe('canvas object geometry', () => {
  it('uses pressure only for pen input', () => {
    expect(pressureAdjustedSize(8, { pointerType: 'mouse', pressure: 0.5 })).toBe(8);
    expect(pressureAdjustedSize(8, { pointerType: 'pen', pressure: 1 })).toBe(8);
    expect(pressureAdjustedSize(8, { pointerType: 'pen', pressure: 0.5 })).toBe(5);
  });

  it('averages committed stroke widths and preserves an empty fallback', () => {
    expect(committedStrokeSize([], 4)).toBe(4);
    expect(
      committedStrokeSize(
        [
          { x0: 0, y0: 0, x1: 1, y1: 1, color: '#fff', size: 2 },
          { x0: 1, y0: 1, x1: 2, y1: 2, color: '#fff', size: 6 },
        ],
        1,
      ),
    ).toBe(4);
  });

  it('normalizes negative object dimensions', () => {
    expect(
      getObjectBounds({
        id: 'rect-1',
        type: 'rectangle',
        x: 10,
        y: 20,
        width: -4,
        height: -8,
        color: '#fff',
        size: 1,
      }),
    ).toEqual({ x: 6, y: 12, width: 4, height: 8 });
  });

  it('maps a world point into rotated object space', () => {
    const mapped = pointInObjectSpace(
      { x: 10, y: 5 },
      {
        id: 'rect-1',
        type: 'rectangle',
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        rotation: 90,
        color: '#fff',
        size: 1,
      },
    );
    expect(mapped.x).toBeCloseTo(5);
    expect(mapped.y).toBeCloseTo(0);
  });

  it('accepts only supported triangle modes', () => {
    expect(isTriangleMode('45-45-90')).toBe(true);
    expect(isTriangleMode('equilateral')).toBe(false);
  });
});
