/** Live-ink commit: freehand vs auto-fitted shape, then presentation steps. */
import type { DrawingObject } from '@/store/drawingStore';
import type { DrawingData, StrokeData } from '@/types/socket';
import type { PresentationCommand } from '@/lib/canvasPresentation';
import { FEATURES } from '@/config/features';
import {
  createFreehandFromStroke,
  createObjectFromFittedDrawing,
} from '@/lib/canvasShapeCommit';
import { createFreehandStrokeObject, toRetainedStrokeData } from '@/lib/freehandStroke';
import { buildStrokePoints } from '@/lib/canvasPointer';
import type { FittedDrawing } from '@/lib/canvasShapeFit';

interface StrokeStyle {
  color: string;
  size: number;
  alpha: number;
}

export type PlannedStrokeCommit =
  | { kind: 'none' }
  | { kind: 'freehand'; object: DrawingObject }
  | { kind: 'fitted'; object: DrawingData; liveGroupId: string | null };

export function planLiveStrokeCommit(args: {
  currentStroke: StrokeData[];
  currentTool: string;
  autoDrawing: boolean;
  style: StrokeStyle;
  drawingFilled: boolean;
  generateId: () => string;
  detectDrawing: (points: { x: number; y: number }[]) => FittedDrawing | null;
  liveGroupId: string | null;
}): PlannedStrokeCommit {
  if (args.currentStroke.length === 0) return { kind: 'none' };

  if (FEATURES.AUTO_DRAWING && args.autoDrawing && args.currentTool === 'pen') {
    const pathPoints = [
      { x: args.currentStroke[0].x0, y: args.currentStroke[0].y0 },
      ...args.currentStroke.map((segment) => ({ x: segment.x1, y: segment.y1 })),
    ];
    const drawing = args.detectDrawing(pathPoints);
    if (drawing) {
      return {
        kind: 'fitted',
        liveGroupId: args.liveGroupId,
        object: createObjectFromFittedDrawing(
          drawing,
          args.style,
          args.drawingFilled,
          args.generateId(),
          args.currentStroke,
        ),
      };
    }
  }

  return {
    kind: 'freehand',
    object:
      FEATURES.AUTO_DRAWING && args.autoDrawing && args.currentTool === 'pen'
        ? createFreehandStrokeObject({
            id: args.generateId(),
            points: buildStrokePoints(args.currentStroke),
            color: args.style.color,
            size: args.style.size,
            alpha: args.style.alpha,
          })
        : createFreehandFromStroke(args.currentStroke, args.style, args.generateId()),
  };
}

export type StrokeCommitStep =
  | { kind: 'send'; command: PresentationCommand }
  | { kind: 'retain'; object: DrawingObject };

export function strokeCommitSteps(
  planned: PlannedStrokeCommit,
  opts: { themeBg: string; brushSize: number; liveGroupId: string | null },
): StrokeCommitStep[] {
  if (planned.kind === 'none') return [];
  if (planned.kind === 'fitted') {
    const steps: StrokeCommitStep[] = [];
    if (planned.liveGroupId) {
      steps.push({ kind: 'send', command: { type: 'remove-group', groupId: planned.liveGroupId } });
    }
    steps.push({
      kind: 'send',
      command: {
        type: 'clear-shape',
        data: {
          ...planned.object,
          id: 'temp',
          color: opts.themeBg,
          size: Math.max(opts.brushSize, 1),
        },
      },
    });
    steps.push({ kind: 'retain', object: planned.object as DrawingObject });
    steps.push({ kind: 'send', command: { type: 'shape', data: planned.object } });
    return steps;
  }
  const steps: StrokeCommitStep[] = [{ kind: 'retain', object: planned.object }];
  if (opts.liveGroupId) {
    steps.push({ kind: 'send', command: { type: 'remove-group', groupId: opts.liveGroupId } });
  }
  steps.push({
    kind: 'send',
    command: { type: 'shape', data: toRetainedStrokeData(planned.object) },
  });
  return steps;
}
