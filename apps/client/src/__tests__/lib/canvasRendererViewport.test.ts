import { describe, expect, it } from 'vitest';
import { createRendererViewportMessage } from '@/lib/canvasRendererViewport';

describe('renderer viewport messages', () => {
  it('includes the canvas dimensions, viewport state, and device pixel ratio', () => {
    expect(
      createRendererViewportMessage(
        { width: 1200, height: 800 },
        { zoom: 1.5, viewX: 40, viewY: 60 },
        2,
      ),
    ).toEqual({
      type: 'viewport',
      zoom: 1.5,
      viewX: 40,
      viewY: 60,
      canvasWidth: 1200,
      canvasHeight: 800,
      dpr: 2,
    });
  });
});
