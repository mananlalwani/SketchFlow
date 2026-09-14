import type { DrawingObject } from '@/store/drawingStore';
import type { DrawingData, StrokeData } from '@/types/socket';
import type { FittedDrawing } from './canvasShapeFit';
import { calculateTriangleVertices, type TriangleMode } from './canvasViewport';
import { committedStrokeSize } from './canvasObjectGeometry';
import { createFreehandStrokeObject } from './freehandStroke';
import { buildStrokePoints } from './canvasPointer';

interface StrokeStyle {
  color: string;
  size: number;
  alpha: number;
}

export function createTriangleFromVertices(
  vertices: { x: number; y: number }[],
  style: StrokeStyle,
  filled: boolean,
  id: string,
): DrawingObject {
  const xs = vertices.map((vertex) => vertex.x);
  const ys = vertices.map((vertex) => vertex.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    id,
    type: 'triangle',
    points: vertices,
    x: minX,
    y: minY,
    width: Math.max(...xs) - minX,
    height: Math.max(...ys) - minY,
    color: style.color,
    size: style.size,
    alpha: style.alpha,
    filled,
  };
}

export function createObjectFromFittedDrawing(
  drawing: FittedDrawing,
  style: StrokeStyle,
  filled: boolean,
  id: string,
  strokes: StrokeData[],
): DrawingData {
  const common = {
    id,
    x: Math.min(drawing.x, drawing.x + drawing.width),
    y: Math.min(drawing.y, drawing.y + drawing.height),
    width: Math.abs(drawing.width),
    height: Math.abs(drawing.height),
    color: style.color,
    size: committedStrokeSize(strokes, style.size),
    alpha: style.alpha,
  };
  if (drawing.kind === 'parabola') {
    const parabola: DrawingData = {
      ...common,
      type: 'parabola',
      orientation: drawing.orientation,
    };
    if (drawing.points !== undefined && drawing.points.length > 0) {
      parabola.points = drawing.points;
    }
    return parabola;
  }
  if (drawing.kind === 'line') {
    return { ...common, type: 'line' };
  }
  const fitted: DrawingData = {
    ...common,
    type: drawing.kind,
    filled,
  };
  if (drawing.kind === 'triangle' && drawing.points?.length === 3) {
    fitted.points = drawing.points;
  }
  return fitted;
}

export function createFreehandFromStroke(
  strokes: StrokeData[],
  style: StrokeStyle,
  id: string,
): DrawingObject {
  return createFreehandStrokeObject({
    id,
    points: buildStrokePoints(strokes),
    color: style.color,
    size: committedStrokeSize(strokes, style.size),
    alpha: style.alpha,
  });
}

export function createFigureFromPreview(
  tool: 'line' | 'rectangle' | 'ellipse' | 'star' | 'triangle',
  start: { x: number; y: number },
  preview: { endX: number; endY: number },
  style: StrokeStyle,
  filled: boolean,
  id: string,
  extra?: { starPoints?: 5 | 6 | 8; triangleMode?: TriangleMode },
): DrawingObject | null {
  if (tool === 'line') {
    return {
      id,
      type: 'line',
      x: start.x,
      y: start.y,
      width: preview.endX - start.x,
      height: preview.endY - start.y,
      color: style.color,
      size: style.size,
      alpha: style.alpha,
    };
  }
  if (tool === 'rectangle' || tool === 'ellipse') {
    return {
      id,
      type: tool,
      x: Math.min(start.x, preview.endX),
      y: Math.min(start.y, preview.endY),
      width: Math.abs(preview.endX - start.x),
      height: Math.abs(preview.endY - start.y),
      color: style.color,
      size: style.size,
      alpha: style.alpha,
      filled,
    };
  }
  if (tool === 'star') {
    const outerRadius = Math.hypot(preview.endX - start.x, preview.endY - start.y);
    return {
      id,
      type: 'star',
      x: start.x - outerRadius,
      y: start.y - outerRadius,
      width: outerRadius * 2,
      height: outerRadius * 2,
      color: style.color,
      size: style.size,
      alpha: style.alpha,
      filled,
      properties: { pointCount: extra?.starPoints ?? 5 },
    };
  }
  if (tool === 'triangle' && extra?.triangleMode) {
    return createTriangleFromVertices(
      calculateTriangleVertices(start.x, start.y, preview.endX, preview.endY, extra.triangleMode),
      style,
      filled,
      id,
    );
  }
  return null;
}

export function createTextObject(input: {
  id: string;
  x: number;
  y: number;
  text: string;
  fontSize: number;
  color: string;
  size: number;
  alpha: number;
}): DrawingObject {
  const ctx = document.createElement('canvas').getContext('2d');
  const lines = input.text.split('\n');
  if (ctx) ctx.font = `${input.fontSize}px Inter, system-ui, sans-serif`;
  const maxWidth = ctx
    ? Math.max(...lines.map((line) => ctx.measureText(line).width))
    : Math.max(...lines.map((line) => line.length), 1) * input.fontSize * 0.6;
  return {
    id: input.id,
    type: 'text',
    x: input.x,
    y: input.y,
    text: input.text,
    fontSize: input.fontSize,
    color: input.color,
    size: input.size,
    alpha: input.alpha,
    width: maxWidth,
    height: input.fontSize * lines.length * 1.4,
  };
}
