/** Coalesced pointer samples → live stroke segments for the worker. */
import type { StrokeData } from '@/types/socket';
import { pressureAdjustedSize } from '@/lib/canvasObjectGeometry';
import type { CanvasPoint, PointerSample } from '@/lib/canvasPointer';

export function appendLiveStrokeSegments(args: {
  samples: readonly PointerSample[];
  lastPoint: CanvasPoint | null;
  toWorld: (clientX: number, clientY: number) => CanvasPoint;
  groupId: string | null;
  color: string;
  alpha: number;
  brushSize: number;
}): { segments: StrokeData[]; lastPoint: CanvasPoint | null } {
  const segments: StrokeData[] = [];
  let lastPoint = args.lastPoint;

  for (const sample of args.samples) {
    const point = args.toWorld(sample.clientX, sample.clientY);
    if (!lastPoint) {
      lastPoint = point;
      continue;
    }
    if (!args.groupId) {
      lastPoint = point;
      continue;
    }

    segments.push({
      x0: lastPoint.x,
      y0: lastPoint.y,
      x1: point.x,
      y1: point.y,
      color: args.color,
      size: pressureAdjustedSize(args.brushSize, sample),
      pressure: sample.pressure,
      alpha: args.alpha,
      timestamp: Date.now(),
      groupId: args.groupId,
    });
    lastPoint = point;
  }

  return { segments, lastPoint };
}
