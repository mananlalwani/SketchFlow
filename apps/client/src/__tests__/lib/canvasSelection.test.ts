import { describe, expect, it } from 'vitest';
import {
  distancePointToSegment,
  findCanvasObjectIdAt,
  findCanvasObjectIdsInSelection,
} from '@/lib/canvasSelection';

describe('canvas selection geometry', () => {
  it('measures distance to the closest point on a segment', () => {
    expect(distancePointToSegment(5, 3, 0, 0, 10, 0)).toBe(3);
    expect(distancePointToSegment(-2, 0, 0, 0, 10, 0)).toBe(2);
  });

  it('handles zero-length segments', () => {
    expect(distancePointToSegment(3, 4, 0, 0, 0, 0)).toBe(5);
  });

  it('hit-tests single-point dots using their retained pressure width', () => {
    const objects = [
      {
        id: 'small-dot',
        type: 'stroke' as const,
        points: [{ x: 10, y: 10, width: 2, pressure: 0.1 }],
        color: '#2563eb',
        size: 2,
      },
      {
        id: 'large-dot',
        type: 'stroke' as const,
        points: [{ x: 30, y: 10, width: 20, pressure: 1 }],
        color: '#2563eb',
        size: 2,
      },
    ];

    expect(findCanvasObjectIdAt(objects, 17, 10)).toBeNull();
    expect(findCanvasObjectIdAt(objects, 38, 10)).toBe('large-dot');
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

  it('hit-tests a rotated object in its local coordinates', () => {
    const objects = [
      {
        id: 'rotated',
        type: 'rectangle' as const,
        x: 0,
        y: 0,
        width: 40,
        height: 20,
        rotation: 90,
        color: '#fff',
        size: 1,
      },
    ];

    expect(findCanvasObjectIdAt(objects, 20, 25)).toBe('rotated');
    expect(findCanvasObjectIdAt(objects, 40, 10)).toBeNull();
  });

  it('hit-tests text from its rendered top edge through every line', () => {
    const objects = [
      {
        id: 'text',
        type: 'text' as const,
        x: 40,
        y: 100,
        width: 80,
        height: 56,
        text: 'First\nSecond',
        fontSize: 20,
        color: '#fff',
        size: 1,
      },
    ];

    expect(findCanvasObjectIdAt(objects, 60, 104)).toBe('text');
    expect(findCanvasObjectIdAt(objects, 60, 150)).toBe('text');
    expect(findCanvasObjectIdAt(objects, 60, 90)).toBeNull();
  });

  it('uses zIndex for hit-testing while keeping array position as the legacy fallback', () => {
    const objects = [
      {
        id: 'top',
        type: 'rectangle' as const,
        x: 0,
        y: 0,
        width: 20,
        height: 20,
        color: '#fff',
        size: 1,
        zIndex: 10,
      },
      {
        id: 'bottom',
        type: 'rectangle' as const,
        x: 0,
        y: 0,
        width: 20,
        height: 20,
        color: '#000',
        size: 1,
        zIndex: 1,
      },
    ];

    expect(findCanvasObjectIdAt(objects, 10, 10)).toBe('top');
  });

  it('selects pressure-expanded handwriting strokes with a right-to-left marquee', () => {
    const objects = [
      {
        id: 'first-stroke',
        type: 'stroke' as const,
        points: [
          { x: 20, y: 20, width: 8 },
          { x: 40, y: 20, width: 8 },
        ],
        color: '#2563eb',
        size: 2,
      },
      {
        id: 'second-stroke',
        type: 'stroke' as const,
        points: [
          { x: 60, y: 20 },
          { x: 80, y: 20 },
        ],
        color: '#2563eb',
        size: 2,
      },
      {
        id: 'hidden-stroke',
        type: 'stroke' as const,
        points: [
          { x: 25, y: 40 },
          { x: 35, y: 40 },
        ],
        color: '#2563eb',
        size: 2,
        hidden: true,
      },
    ];

    expect(
      findCanvasObjectIdsInSelection(objects, {
        startX: 90,
        startY: 30,
        endX: 10,
        endY: 10,
      }),
    ).toEqual(['first-stroke', 'second-stroke']);
  });

  it('requires full containment for a left-to-right marquee', () => {
    const objects = [
      {
        id: 'inside',
        type: 'stroke' as const,
        points: [
          { x: 20, y: 20 },
          { x: 30, y: 20 },
        ],
        color: '#2563eb',
        size: 2,
      },
      {
        id: 'partial',
        type: 'stroke' as const,
        points: [
          { x: 0, y: 20 },
          { x: 30, y: 20 },
        ],
        color: '#2563eb',
        size: 2,
      },
    ];

    expect(
      findCanvasObjectIdsInSelection(objects, {
        startX: 10,
        startY: 10,
        endX: 40,
        endY: 30,
      }),
    ).toEqual(['inside']);
  });
});
