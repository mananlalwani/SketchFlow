import { describe, expect, it } from 'vitest';

import { createSceneLoadMessage, isRendererWorkerEvent } from '@/lib/rendererWorkerProtocol';

describe('renderer worker protocol', () => {
  it('separates shapes from stroke segments in a bulk scene message', () => {
    const message = createSceneLoadMessage('scene-1', [
      {
        id: 'rectangle-1',
        type: 'rectangle',
        x: 1,
        y: 2,
        width: 3,
        height: 4,
        color: '#123456',
        size: 2,
        alpha: 1,
      },
      {
        x0: 1,
        y0: 2,
        x1: 3,
        y1: 4,
        color: '#654321',
        size: 2,
      },
    ]);

    expect(message).toMatchObject({ type: 'load-scene', requestId: 'scene-1' });
    expect(message.drawings).toHaveLength(1);
    expect(message.strokes).toHaveLength(1);
  });

  it('recognizes only known renderer event kinds', () => {
    expect(isRendererWorkerEvent({ type: 'ready' })).toBe(true);
    expect(isRendererWorkerEvent({ type: 'init-error', reason: 'no context' })).toBe(true);
    expect(isRendererWorkerEvent({ type: 'init-error' })).toBe(false);
    expect(
      isRendererWorkerEvent({
        type: 'scene-applied',
        requestId: 'scene',
        objectCount: 1,
        ingestionMs: 2,
      }),
    ).toBe(true);
    expect(
      isRendererWorkerEvent({
        type: 'frame-rendered',
        renderMs: 2,
        retainedObjectCount: 3,
        visibleObjectCount: 1,
        culledObjectCount: 2,
      }),
    ).toBe(true);
    expect(isRendererWorkerEvent({ type: 'scene-applied' })).toBe(false);
    expect(isRendererWorkerEvent({ type: 'unexpected' })).toBe(false);
    expect(isRendererWorkerEvent(null)).toBe(false);
  });
});
