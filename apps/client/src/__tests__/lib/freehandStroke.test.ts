import { describe, expect, it } from 'vitest';
import {
  createFreehandStrokeObject,
  createFreehandTapObject,
  toRetainedStrokeData,
} from '@/lib/freehandStroke';
import { exportAsSVG } from '@/lib/export';

describe('createFreehandStrokeObject', () => {
  it('retains color, broad size, and translucent alpha on an ordinary stroke object', () => {
    const points = [
      { x: 2, y: 3, width: 20 },
      { x: 8, y: 9, pressure: 0.7, width: 22 },
    ];

    const object = createFreehandStrokeObject({
      id: 'highlighter-stroke',
      points,
      color: '#facc15',
      size: 21,
      alpha: 0.35,
    });

    expect(object).toEqual({
      id: 'highlighter-stroke',
      type: 'stroke',
      points,
      color: '#facc15',
      size: 21,
      alpha: 0.35,
    });
  });

  it('keeps highlighter opacity through SVG export', () => {
    const object = createFreehandStrokeObject({
      id: 'exported-highlighter',
      points: [
        { x: 0, y: 0 },
        { x: 12, y: 8 },
      ],
      color: '#facc15',
      size: 18,
      alpha: 0.35,
    });

    expect(exportAsSVG([object])).toContain('opacity="0.35"');
  });

  it('retains a one point stroke for a pen or highlighter tap', () => {
    expect(
      createFreehandStrokeObject({
        id: 'tap',
        points: [{ x: 12, y: 24, width: 6 }],
        color: '#2563eb',
        size: 6,
        alpha: 1,
      }),
    ).toMatchObject({
      type: 'stroke',
      points: [{ x: 12, y: 24, width: 6 }],
    });
  });

  it('uses stylus pressure for a retained tap dot width', () => {
    const object = createFreehandTapObject({
      id: 'pressured-tap',
      x: 12,
      y: 24,
      baseSize: 20,
      pointerType: 'pen',
      pressure: 0.5,
      color: '#2563eb',
      alpha: 1,
    });

    expect(object.size).toBe(12.5);
    expect(object.points?.[0]).toMatchObject({ width: 12.5, pressure: 0.5 });
  });

  it('creates an ordered retained renderer payload without losing point metadata', () => {
    const object = createFreehandStrokeObject({
      id: 'ordered-stroke',
      points: [{ x: 2, y: 3, pressure: 0.7, width: 8 }],
      color: '#123456',
      size: 8,
      alpha: 0.5,
    });

    expect(toRetainedStrokeData(object)).toMatchObject({
      id: 'ordered-stroke',
      type: 'stroke',
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      points: [{ x: 2, y: 3, pressure: 0.7, width: 8 }],
    });
  });
});
