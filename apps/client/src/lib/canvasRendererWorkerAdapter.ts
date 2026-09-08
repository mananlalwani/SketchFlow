import type { RendererDrawing, RendererDrawingContext } from './canvasRendererCommands';
import { drawRendererObject } from './canvasRendererCommands';

/** Worker adapter: keeps worker-only color and line-width policy at the seam. */
export function drawWorkerRendererObject(
  context: RendererDrawingContext,
  object: RendererDrawing,
  color: string,
  size = object.size,
) {
  drawRendererObject(context, { ...object, color, size });
}
