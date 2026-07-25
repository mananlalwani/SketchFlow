import { describe, expect, it } from 'vitest';
import { createCanvasImage, toImageShapeData } from '@/lib/canvasImage';

describe('canvas image helpers', () => {
  it('centers an image in world coordinates and creates its renderer payload', () => {
    const image = createCanvasImage({
      id: 'image-1',
      centerX: 100,
      centerY: 80,
      width: 40,
      height: 20,
      dataUrl: 'data:image/png;base64,abc',
    });
    expect(image).toMatchObject({ x: 80, y: 70, width: 40, height: 20 });
    expect(toImageShapeData(image)).toMatchObject({ type: 'image', x: 80, y: 70 });
  });
});
