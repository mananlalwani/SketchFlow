import { describe, expect, it } from 'vitest';
import {
  committedStrokeSize,
  getObjectBounds,
  isTriangleMode,
  pointInObjectSpace,
  pressureAdjustedSize,
  unionObjectBounds,
  canDirectTransformObject,
  getObjectDirtyRect,
  rectsOverlap,
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

  it('uses the widest authored point width for stroke bounds', () => {
    expect(
      getObjectBounds({
        id: 'pressure-stroke',
        type: 'stroke',
        color: '#fff',
        size: 2,
        points: [
          { x: 10, y: 20, width: 2 },
          { x: 30, y: 40, width: 12 },
        ],
      }),
    ).toEqual({ x: -2, y: 8, width: 44, height: 44 });
  });

  it('uses retained pressure when an older stroke point has no authored width', () => {
    expect(
      getObjectBounds({
        id: 'legacy-pressure-stroke',
        type: 'stroke',
        color: '#facc15',
        size: 20,
        points: [{ x: 10, y: 20, pressure: 0.5 }],
      }),
    ).toEqual({ x: -2.5, y: 7.5, width: 25, height: 25 });
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

  it('unions object bounds and gates direct transforms', () => {
    expect(
      unionObjectBounds([
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 8, y: 8, width: 10, height: 10 },
      ]),
    ).toEqual({ x: 0, y: 0, width: 18, height: 18 });

    const rectangle = {
      id: 'rect-1',
      type: 'rectangle' as const,
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      color: '#fff',
      size: 1,
    };
    expect(canDirectTransformObject(rectangle, 1, 'editor')).toBe(true);
    expect(canDirectTransformObject(rectangle, 2, 'editor')).toBe(false);
    expect(canDirectTransformObject({ ...rectangle, locked: true }, 1, 'editor')).toBe(false);
  });

  it('pads dirty rects with stroke size', () => {
    const rect = getObjectDirtyRect({
      id: 'rect-1',
      type: 'rectangle',
      x: 10,
      y: 20,
      width: 30,
      height: 40,
      color: '#fff',
      size: 2,
    });
    expect(rect).toEqual({ x: 8, y: 18, width: 34, height: 44 });
    expect(rectsOverlap(rect, { x: 40, y: 18, width: 4, height: 4 })).toBe(true);
    expect(rectsOverlap(rect, { x: 50, y: 80, width: 4, height: 4 })).toBe(false);
  });
});
