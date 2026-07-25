import { describe, expect, it } from 'vitest';
import { distancePointToSegment, findCanvasObjectIdAt } from '@/lib/canvasSelection';

describe('canvas selection geometry', () => {
  it('measures distance to the closest point on a segment', () => {
    expect(distancePointToSegment(5, 3, 0, 0, 10, 0)).toBe(3);
    expect(distancePointToSegment(-2, 0, 0, 0, 10, 0)).toBe(2);
  });

  it('handles zero-length segments', () => {
    expect(distancePointToSegment(3, 4, 0, 0, 0, 0)).toBe(5);
  });

  it('selects the topmost hit object and ignores images unless requested', () => {
    const objects = [
      {
        id: 'rectangle',
        type: 'rectangle' as const,
        x: 0,
        y: 0,
        width: 20,
        height: 20,
        color: '#fff',
        size: 1,
      },
      {
        id: 'image',
        type: 'image' as const,
        x: 0,
        y: 0,
        width: 20,
        height: 20,
        color: '#fff',
        size: 1,
      },
    ];

    expect(findCanvasObjectIdAt(objects, 10, 10)).toBe('rectangle');
    expect(findCanvasObjectIdAt(objects, 10, 10, { includeImages: true })).toBe('image');
  });
});
