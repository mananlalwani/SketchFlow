import { describe, expect, it, vi } from 'vitest';
import { CanvasPresentation } from '@/lib/canvasPresentation';
import { drawRendererObject } from '@/lib/canvasRendererCommands';
import { drawWorkerRendererObject } from '@/lib/canvasRendererWorkerAdapter';

function harness() {
  const sent: object[] = [];
  const frames = new Map<number, () => void>();
  let nextFrame = 1;
  const scheduler = {
    frame: (callback: () => void) => {
      const id = nextFrame++;
      frames.set(id, callback);
      return id;
    },
    cancel: (id: number) => frames.delete(id),
    run: () => {
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach((callback) => callback());
    },
  };
  return {
    sent,
    scheduler,
    presentation: new CanvasPresentation(
      { ready: false, send: (message) => sent.push(message), dispose: vi.fn() },
      scheduler,
    ),
  };
}

function recordingContext() {
  const calls: string[] = [];
  const context = new Proxy(
    {},
    {
      get:
        (_, property: string) =>
        (...args: unknown[]) => {
          calls.push(`${property}:${JSON.stringify(args)}`);
        },
    },
  ) as unknown as CanvasRenderingContext2D;
  return { context, calls };
}

describe('CanvasPresentation', () => {
  it('uses the same retained object vocabulary for fallback vector commands', () => {
    const context = new Proxy({}, { get: () => vi.fn() }) as unknown as CanvasRenderingContext2D;
    const base = { id: 'object', x: 0, y: 0, width: 20, height: 20, color: '#000', size: 2 };
    for (const type of [
      'line',
      'rectangle',
      'ellipse',
      'circle',
      'triangle',
      'star',
      'arrow',
      'parabola',
      'text',
    ] as const) {
      expect(() =>
        drawRendererObject(context, { ...base, type, text: type === 'text' ? 'hello' : undefined }),
      ).not.toThrow();
    }
    expect(() =>
      drawRendererObject(context, {
        ...base,
        type: 'stroke',
        points: [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
        ],
      }),
    ).not.toThrow();
  });

  it('keeps worker and fallback adapters on identical retained-object semantics', () => {
    const object = {
      id: 'pressure-stroke',
      type: 'stroke' as const,
      x: 10,
      y: 20,
      width: 40,
      height: 30,
      color: '#123456',
      size: 3,
      alpha: 0.75,
      rotation: 25,
      points: [
        { x: 10, y: 20, width: 2 },
        { x: 30, y: 35, width: 4 },
      ],
      properties: { rotation: 25, hidden: false },
    };
    const worker = recordingContext();
    const fallback = recordingContext();

    drawWorkerRendererObject(worker.context, object, object.color);
    drawRendererObject(fallback.context, object);

    expect(worker.calls).toEqual(fallback.calls);
    expect(worker.calls).toContain('rotate:[0.4363323129985824]');
    expect(worker.calls.filter((call) => call.startsWith('lineTo:'))).toHaveLength(1);

    const hidden = recordingContext();
    drawRendererObject(hidden.context, { ...object, hidden: true });
    expect(hidden.calls).toEqual([]);
  });

  it('queues commands until the adapter is ready', () => {
    const { sent, presentation } = harness();
    presentation.clear();
    expect(sent).toHaveLength(0);
    presentation.markReady();
    expect(sent).toEqual([{ type: 'clear' }]);
  });

  it('coalesces strokes and viewport updates to one frame', () => {
    const { sent, scheduler, presentation } = harness();
    presentation.markReady();
    presentation.appendStroke({ x0: 0, y0: 0, x1: 1, y1: 1, color: '#000', size: 2, groupId: 'g' });
    presentation.appendStroke({ x0: 1, y0: 1, x1: 2, y1: 2, color: '#000', size: 2, groupId: 'g' });
    presentation.setViewport({ width: 100, height: 80 }, { zoom: 2, viewX: 3, viewY: 4 });
    presentation.setViewport({ width: 100, height: 80 }, { zoom: 3, viewX: 5, viewY: 6 });
    scheduler.run();
    expect(sent).toHaveLength(2);
    expect(sent[0]).toMatchObject({ type: 'strokes', data: [{ x0: 0 }, { x0: 1 }] });
    expect(sent[1]).toMatchObject({ type: 'viewport', zoom: 3, viewX: 5, viewY: 6 });
  });

  it('cancels scheduled delivery and disposes the adapter', () => {
    const { sent, scheduler, presentation } = harness();
    presentation.markReady();
    presentation.appendStroke({ x0: 0, y0: 0, x1: 1, y1: 1, color: '#000', size: 2, groupId: 'g' });
    presentation.dispose();
    scheduler.run();
    expect(sent).toHaveLength(0);
    expect(presentation.ready).toBe(false);
  });
});
