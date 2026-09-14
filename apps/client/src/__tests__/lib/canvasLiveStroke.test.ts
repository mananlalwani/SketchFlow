import { describe, expect, it, vi } from 'vitest';
import { appendLiveStrokeSegments } from '@/lib/canvasLiveStroke';
import { planLiveStrokeCommit } from '@/lib/canvasStrokeCommit';
import { shouldCancelActiveCanvasGesture } from '@/lib/canvasInputPolicy';

describe('appendLiveStrokeSegments', () => {
  it('skips the first sample then emits one segment per following sample', () => {
    const { segments, lastPoint } = appendLiveStrokeSegments({
      samples: [
        { clientX: 10, clientY: 10, pointerType: 'pen', pressure: 0.5 },
        { clientX: 20, clientY: 20, pointerType: 'pen', pressure: 0.8 },
      ],
      lastPoint: null,
      toWorld: (x, y) => ({ x, y }),
      groupId: 'g1',
      color: '#000',
      alpha: 1,
      brushSize: 4,
    });
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({
      x0: 10,
      y0: 10,
      x1: 20,
      y1: 20,
      groupId: 'g1',
      color: '#000',
    });
    expect(lastPoint).toEqual({ x: 20, y: 20 });
  });

  it('emits nothing when the live stroke has no group id', () => {
    const { segments, lastPoint } = appendLiveStrokeSegments({
      samples: [
        { clientX: 1, clientY: 1, pointerType: 'mouse', pressure: 0.5 },
        { clientX: 2, clientY: 2, pointerType: 'mouse', pressure: 0.5 },
      ],
      lastPoint: { x: 0, y: 0 },
      toWorld: (x, y) => ({ x, y }),
      groupId: null,
      color: '#000',
      alpha: 1,
      brushSize: 2,
    });
    expect(segments).toEqual([]);
    expect(lastPoint).toEqual({ x: 2, y: 2 });
  });
});

describe('planLiveStrokeCommit', () => {
  const stroke = {
    x0: 0,
    y0: 0,
    x1: 10,
    y1: 0,
    color: '#111',
    size: 2,
    pressure: 1,
    alpha: 1,
    timestamp: 1,
    groupId: 'g',
  };

  it('returns none for an empty stroke', () => {
    expect(
      planLiveStrokeCommit({
        currentStroke: [],
        currentTool: 'pen',
        autoDrawing: false,
        style: { color: '#111', size: 2, alpha: 1 },
        drawingFilled: false,
        generateId: () => 'id',
        detectDrawing: () => null,
        liveGroupId: 'g',
      }),
    ).toEqual({ kind: 'none' });
  });

  it('uses a fitted drawing when auto-draw succeeds', () => {
    const detectDrawing = vi.fn(() => ({
      kind: 'line' as const,
      x: 0,
      y: 0,
      width: 10,
      height: 0,
    }));
    const planned = planLiveStrokeCommit({
      currentStroke: [stroke],
      currentTool: 'pen',
      autoDrawing: true,
      style: { color: '#111', size: 2, alpha: 1 },
      drawingFilled: false,
      generateId: () => 'fitted',
      detectDrawing,
      liveGroupId: 'g',
    });
    expect(planned.kind).toBe('fitted');
    if (planned.kind === 'fitted') {
      expect(planned.object).toMatchObject({ id: 'fitted', type: 'line' });
      expect(planned.liveGroupId).toBe('g');
    }
  });
});

describe('shouldCancelActiveCanvasGesture', () => {
  it('cancels a lost stylus pointer that owned the gesture', () => {
    expect(
      shouldCancelActiveCanvasGesture({
        pointerType: 'pen',
        pointerId: 3,
        activePointerId: 3,
        wasActivePen: true,
        remainingPenCount: 0,
        isPanning: false,
        isDrawing: true,
        hasActiveDrag: false,
      }),
    ).toBe(true);
  });

  it('leaves a mouse gesture alone when another pointer is cancelled', () => {
    expect(
      shouldCancelActiveCanvasGesture({
        pointerType: 'mouse',
        pointerId: 9,
        activePointerId: 2,
        wasActivePen: false,
        remainingPenCount: 0,
        isPanning: false,
        isDrawing: true,
        hasActiveDrag: false,
      }),
    ).toBe(false);
  });
});
