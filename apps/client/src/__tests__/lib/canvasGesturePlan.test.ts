import { describe, expect, it } from 'vitest';
import {
  planPointerDownRoute,
  planSessionDrag,
  shouldInterruptTouchForPen,
} from '@/lib/canvasGesturePlan';
import { planDeleteSelection } from '@/lib/canvasSelectGesture';
import { planLiveStrokeCommit, strokeCommitSteps } from '@/lib/canvasStrokeCommit';

describe('planPointerDownRoute', () => {
  it('routes select, pan, right-click, and draw tools', () => {
    expect(planPointerDownRoute({ currentTool: 'move', isSpacePan: false, button: 0 })).toBe(
      'select',
    );
    expect(planPointerDownRoute({ currentTool: 'pen', isSpacePan: true, button: 0 })).toBe('pan');
    expect(planPointerDownRoute({ currentTool: 'pen', isSpacePan: false, button: 2 })).toBe(
      'ignore',
    );
    expect(planPointerDownRoute({ currentTool: 'rectangle', isSpacePan: false, button: 0 })).toBe(
      'draw-tool',
    );
  });
});

describe('planSessionDrag', () => {
  const idle = {
    skipCustomTriangle: false,
    tap: false,
    touchBlocked: false,
    shouldPan: false,
    isPanning: false,
    active: true,
    hasPanOrigin: false,
    nativeMissing: false,
    hasActiveDrag: false,
    isDrawing: false,
    canStartDraw: true,
  };

  it('starts drawing, then moves, then stops', () => {
    expect(planSessionDrag(idle)).toBe('draw-start');
    expect(planSessionDrag({ ...idle, isDrawing: true })).toBe('draw-move');
    expect(planSessionDrag({ ...idle, active: false, isDrawing: true })).toBe('draw-stop');
  });

  it('pans instead of drawing in hand/multi-touch mode', () => {
    expect(planSessionDrag({ ...idle, shouldPan: true })).toBe('pan-start');
    expect(
      planSessionDrag({ ...idle, shouldPan: true, isPanning: true, hasPanOrigin: true }),
    ).toBe('pan-move');
  });

  it('ignores custom-triangle drags and blocked touch', () => {
    expect(planSessionDrag({ ...idle, skipCustomTriangle: true })).toBe('ignore');
    expect(planSessionDrag({ ...idle, touchBlocked: true })).toBe('ignore');
    expect(planSessionDrag({ ...idle, canStartDraw: false })).toBe('ignore');
  });
});

describe('shouldInterruptTouchForPen', () => {
  it('cancels palm/touch when a stylus arrives', () => {
    expect(
      shouldInterruptTouchForPen({ isStylus: true, hasActivePen: false, hasActiveTouch: true }),
    ).toBe(true);
    expect(
      shouldInterruptTouchForPen({ isStylus: true, hasActivePen: true, hasActiveTouch: true }),
    ).toBe(false);
  });
});

describe('planDeleteSelection', () => {
  const objects = [
    { id: 'a', type: 'rectangle' as const, x: 0, y: 0, width: 1, height: 1, color: '#000', size: 1 },
    {
      id: 'b',
      type: 'rectangle' as const,
      x: 2,
      y: 0,
      width: 1,
      height: 1,
      color: '#000',
      size: 1,
      locked: true,
    },
  ];

  it('refuses viewers, empty selections, and locked members', () => {
    expect(planDeleteSelection({ projectRole: 'viewer', selectedObjectIds: ['a'], objects })).toEqual(
      { kind: 'none' },
    );
    expect(planDeleteSelection({ projectRole: 'editor', selectedObjectIds: [], objects })).toEqual({
      kind: 'none',
    });
    expect(planDeleteSelection({ projectRole: 'editor', selectedObjectIds: ['b'], objects })).toEqual(
      { kind: 'locked' },
    );
  });

  it('returns the remaining objects when deletion is allowed', () => {
    expect(planDeleteSelection({ projectRole: 'editor', selectedObjectIds: ['a'], objects })).toEqual(
      { kind: 'delete', remaining: [objects[1]] },
    );
  });
});

describe('strokeCommitSteps', () => {
  it('retains a freehand stroke then swaps the live group for the retained shape', () => {
    const planned = planLiveStrokeCommit({
      currentStroke: [
        {
          x0: 0,
          y0: 0,
          x1: 4,
          y1: 0,
          color: '#111',
          size: 2,
          pressure: 1,
          alpha: 1,
          timestamp: 1,
          groupId: 'g',
        },
      ],
      currentTool: 'highlighter',
      autoDrawing: false,
      style: { color: '#111', size: 2, alpha: 1 },
      drawingFilled: false,
      generateId: () => 's1',
      detectDrawing: () => null,
      liveGroupId: 'g',
    });
    expect(strokeCommitSteps(planned, { themeBg: '#000', brushSize: 2, liveGroupId: 'g' }).map((step) => step.kind)).toEqual([
      'retain',
      'send',
      'send',
    ]);
  });
});
