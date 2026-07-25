import { describe, expect, it } from 'vitest';

import {
  buildStrokePoints,
  constrainShapeEnd,
  getPointerSamples,
  screenPointToWorld,
} from '@/lib/canvasPointer';

describe('canvas pointer helpers', () => {
  it('converts client coordinates to world coordinates with canvas and viewport offsets', () => {
    expect(
      screenPointToWorld({ left: 100, top: 50 }, { zoom: 2, viewX: 20, viewY: 30 }, 140, 90),
    ).toEqual({ x: 40, y: 50 });
  });

  it('constrains rectangles and ellipses to a square when requested', () => {
    expect(constrainShapeEnd({ x: 10, y: 10 }, { x: 40, y: 20 }, 'rectangle', true)).toEqual({
      x: 20,
      y: 20,
    });
    expect(constrainShapeEnd({ x: 10, y: 10 }, { x: 4, y: 30 }, 'ellipse', true)).toEqual({
      x: 4,
      y: 16,
    });
    expect(constrainShapeEnd({ x: 10, y: 10 }, { x: 40, y: 20 }, 'line', true)).toEqual({
      x: 40,
      y: 20,
    });
  });

  it('creates the contiguous point path for a stroke group', () => {
    expect(
      buildStrokePoints([
        {
          x0: 1,
          y0: 2,
          x1: 3,
          y1: 4,
          color: '#000',
          size: 2,
          alpha: 1,
          groupId: 'a',
          timestamp: 1,
        },
        {
          x0: 3,
          y0: 4,
          x1: 5,
          y1: 6,
          color: '#000',
          size: 2,
          alpha: 1,
          groupId: 'a',
          timestamp: 2,
        },
      ]),
    ).toEqual([
      { x: 1, y: 2 },
      { x: 3, y: 4 },
      { x: 5, y: 6 },
    ]);
  });

  it('uses coalesced pointer samples when a browser provides them', () => {
    const samples = [{ clientX: 10 }, { clientX: 20 }] as PointerEvent[];
    expect(getPointerSamples({ getCoalescedEvents: () => samples } as PointerEvent)).toBe(samples);
  });
});
