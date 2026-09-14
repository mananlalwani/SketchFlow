/** Tool pointer-down, live figure preview, and dragged-figure commit (no React). */
import type { DrawingObject } from '@/store/drawingStore';
import { findCanvasObjectIdAt } from '@/lib/canvasSelection';
import { constrainDrawingEnd } from '@/lib/canvasPointer';
import { createFigureFromPreview } from '@/lib/canvasShapeCommit';
import { isTriangleMode } from '@/lib/canvasObjectGeometry';

export interface StrokeStyle {
  color: string;
  size: number;
  alpha: number;
}

export interface CanvasPoint {
  x: number;
  y: number;
}

export interface DraggedFigurePreview {
  type: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  color: string;
  size: number;
  alpha: number;
}

const DRAG_FIGURE_TOOLS = ['line', 'rectangle', 'ellipse', 'star'] as const;
export type DragFigureTool = (typeof DRAG_FIGURE_TOOLS)[number];

export function isDragFigureTool(tool: string): tool is DragFigureTool {
  for (const candidate of DRAG_FIGURE_TOOLS) {
    if (candidate === tool) return true;
  }
  return false;
}

export function isLiveInkTool(tool: string, eraserMode: string): boolean {
  return tool === 'pen' || tool === 'highlighter' || (tool === 'eraser' && eraserMode === 'partial');
}

export function shouldPlaceInkTap(args: {
  currentTool: string;
  canDraw: boolean;
  pointerMoved: boolean;
}): boolean {
  return (
    (args.currentTool === 'pen' || args.currentTool === 'highlighter') &&
    args.canDraw &&
    !args.pointerMoved
  );
}

export type DrawToolPointerDownPlan =
  | { kind: 'none' }
  | { kind: 'object-erase'; removed: DrawingObject; remaining: DrawingObject[] }
  | { kind: 'start-ink' }
  | { kind: 'start-shape' }
  | { kind: 'open-text' }
  | { kind: 'place-triangle-vertex'; vertices: CanvasPoint[] }
  | { kind: 'commit-triangle'; vertices: CanvasPoint[] };

export function planDrawToolPointerDown(args: {
  currentTool: string;
  eraserMode: string;
  triangleMode: string;
  triangleVertices: CanvasPoint[];
  objects: DrawingObject[];
  world: CanvasPoint;
}): DrawToolPointerDownPlan {
  if (args.currentTool === 'eraser' && args.eraserMode === 'object') {
    const hitId = findCanvasObjectIdAt(args.objects, args.world.x, args.world.y, {
      includeImages: true,
    });
    if (!hitId) return { kind: 'none' };
    const removed = args.objects.find((object) => object.id === hitId);
    if (!removed || removed.locked) return { kind: 'none' };
    return {
      kind: 'object-erase',
      removed,
      remaining: args.objects.filter((object) => object.id !== hitId),
    };
  }

  if (args.currentTool === 'pen' || args.currentTool === 'highlighter' || args.currentTool === 'eraser') {
    return { kind: 'start-ink' };
  }
  if (isDragFigureTool(args.currentTool)) {
    return { kind: 'start-shape' };
  }
  if (args.currentTool === 'text') {
    return { kind: 'open-text' };
  }
  if (args.currentTool === 'triangle') {
    if (args.triangleMode === 'custom') {
      const vertices = [...args.triangleVertices, args.world];
      if (vertices.length < 3) return { kind: 'place-triangle-vertex', vertices };
      return { kind: 'commit-triangle', vertices };
    }
    return { kind: 'start-shape' };
  }
  return { kind: 'none' };
}

export function previewForFigureDrag(args: {
  currentTool: string;
  triangleMode: string;
  start: CanvasPoint;
  end: CanvasPoint;
  constrained: boolean;
  style: StrokeStyle;
}): DraggedFigurePreview | null {
  if (isDragFigureTool(args.currentTool)) {
    const end = constrainDrawingEnd(args.start, args.end, args.currentTool, args.constrained);
    return {
      type: args.currentTool,
      startX: args.start.x,
      startY: args.start.y,
      endX: end.x,
      endY: end.y,
      ...args.style,
    };
  }
  if (args.currentTool === 'triangle' && args.triangleMode !== 'custom') {
    return {
      type: 'triangle',
      startX: args.start.x,
      startY: args.start.y,
      endX: args.end.x,
      endY: args.end.y,
      ...args.style,
    };
  }
  return null;
}

export function planDraggedFigureCommit(args: {
  currentTool: string;
  triangleMode: string;
  start: CanvasPoint | null;
  preview: Pick<DraggedFigurePreview, 'endX' | 'endY'> | null;
  style: StrokeStyle;
  filled: boolean;
  generateId: () => string;
  starPoints: 5 | 6 | 8;
}): DrawingObject | null {
  if (!args.start || !args.preview) return null;
  if (args.currentTool === 'triangle' && !isTriangleMode(args.triangleMode)) return null;
  if (!isDragFigureTool(args.currentTool) && args.currentTool !== 'triangle') return null;
  return createFigureFromPreview(
    args.currentTool,
    args.start,
    args.preview,
    args.style,
    args.filled,
    args.generateId(),
    {
      starPoints: args.starPoints,
      triangleMode: isTriangleMode(args.triangleMode) ? args.triangleMode : undefined,
    },
  );
}
