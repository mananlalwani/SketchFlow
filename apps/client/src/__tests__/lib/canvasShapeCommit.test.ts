import { describe, expect, it } from 'vitest';
import { createShapeFromPreview, createTextObject, createTriangleFromVertices } from '@/lib/canvasShapeCommit';

describe('canvasShapeCommit', () => {
  const style = { color: '#111', size: 3, alpha: 1 };

  it('commits a rectangle from a dragged preview', () => {
    expect(
      createShapeFromPreview(
        'rectangle',
        { x: 10, y: 20 },
        { endX: 4, endY: 8 },
        style,
        true,
        'id-1',
      ),
    ).toMatchObject({
      id: 'id-1',
      type: 'rectangle',
      x: 4,
      y: 8,
      width: 6,
      height: 12,
      filled: true,
    });
  });

  it('builds a triangle from three vertices', () => {
    expect(
      createTriangleFromVertices(
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 0, y: 10 },
        ],
        style,
        false,
        'tri',
      ),
    ).toMatchObject({
      type: 'triangle',
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    });
  });

  it('sizes a text object from measured lines', () => {
    const object = createTextObject({
      id: 'text-1',
      x: 4,
      y: 8,
      text: 'Hi',
      fontSize: 24,
      color: '#111',
      size: 1,
      alpha: 1,
    });
    expect(object).toMatchObject({ type: 'text', x: 4, y: 8, fontSize: 24 });
    expect(object?.width).toBeGreaterThan(0);
    expect(object?.height).toBeGreaterThan(0);
  });
});
