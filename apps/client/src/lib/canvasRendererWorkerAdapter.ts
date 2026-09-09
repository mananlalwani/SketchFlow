import type {
  RendererDrawing,
  RendererDrawingContext,
  RendererStrokePoint,
} from './canvasRendererCommands';
import { drawRendererObject, drawVariableWidthStroke } from './canvasRendererCommands';

export interface RendererStrokePath {
  color: string;
  size: number;
  alpha: number;
  points: readonly RendererStrokePoint[];
}

/** Worker adapter: keeps worker-only color and line-width policy at the seam. */
export function drawWorkerRendererObject(
  context: RendererDrawingContext,
  object: RendererDrawing,
  color: string,
  size = object.size,
) {
  drawRendererObject(context, { ...object, color, size });
}

/** Draws a live consolidated path while retaining its per-point widths. */
export function drawWorkerStrokePath(
  context: RendererDrawingContext,
  path: RendererStrokePath,
  color = path.color,
) {
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = path.size;
  context.globalAlpha = path.alpha;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  drawVariableWidthStroke(context, path.points, path.size);
}
