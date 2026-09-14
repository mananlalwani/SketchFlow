/// <reference lib="webworker" />

import { getMaxStrokeWidth } from '../lib/canvasRendererCommands';
import { drawWorkerRendererObject, drawWorkerStrokePath } from '../lib/canvasRendererWorkerAdapter';
import {
  adjustColorForTheme as mapColorForTheme,
  hexToRgb,
  getLuminance,
  isBackgroundColor,
} from '../lib/rendererWorkerTheme';
import type { Drawing, Stroke, PathContext, ParabolaDrawing } from './rendererWorkerTypes';
import { createRendererRuntime, type RendererRuntime } from './rendererWorkerRuntime';
import { createWorkerBlit } from './rendererWorkerBlit';
import { handleRendererMessage } from './rendererWorkerMessages';

export {};

declare const self: DedicatedWorkerGlobalScope;

function traceParabolaPath(context: PathContext, drawing: ParabolaDrawing) {
  if (drawing.points && drawing.points.length > 1) {
    context.moveTo(drawing.points[0].x, drawing.points[0].y);
    for (const point of drawing.points.slice(1)) context.lineTo(point.x, point.y);
    return;
  }

  const steps = 64;
  const x0 = drawing.x,
    y0 = drawing.y,
    w = drawing.width,
    h = drawing.height;
  if (drawing.orientation === 'left' || drawing.orientation === 'right') {
    const dir = drawing.orientation === 'right' ? 1 : -1;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const yy = y0 + t * h;
      const ny = (t - 0.5) * 2;
      const xx = x0 + (dir > 0 ? 0 : w) + dir * w * (ny * ny);
      if (i === 0) context.moveTo(xx, yy);
      else context.lineTo(xx, yy);
    }
  } else {
    const dir = drawing.orientation === 'down' ? 1 : -1;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const xx = x0 + t * w;
      const nx = (t - 0.5) * 2;
      const yy = y0 + (dir > 0 ? 0 : h) + dir * h * (nx * nx);
      if (i === 0) context.moveTo(xx, yy);
      else context.lineTo(xx, yy);
    }
  }
}

// SAFETY: createRendererRuntime returns the worker's mutable runtime bag; we then fill the host callbacks.
const rt = createRendererRuntime() as RendererRuntime;

rt.postMessage = (msg) => {
  self.postMessage(msg);
};
rt.hexToRgb = hexToRgb;
rt.getLuminance = getLuminance;
rt.isBackgroundColor = isBackgroundColor;
rt.getMaxStrokeWidth = getMaxStrokeWidth;
rt.drawWorkerStrokePath = drawWorkerStrokePath;
rt.drawWorkerRendererObject = drawWorkerRendererObject;
rt.traceParabolaPath = traceParabolaPath;

rt.loadImageBitmap = async (dataUrl: string) => {
  if (rt.imageBitmapCache.has(dataUrl)) {
    return rt.imageBitmapCache.get(dataUrl)!;
  }
  try {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);
    rt.imageBitmapCache.set(dataUrl, bitmap);
    return bitmap;
  } catch {
    return null;
  }
};

rt.applyObjectRotation = (context, drawing) => {
  const degrees = Number(drawing.properties?.rotation ?? 0);
  if (!Number.isFinite(degrees) || degrees === 0) return;
  const centerX = drawing.x + drawing.width / 2;
  const centerY = drawing.y + drawing.height / 2;
  context.translate(centerX, centerY);
  context.rotate((degrees * Math.PI) / 180);
  context.translate(-centerX, -centerY);
};

rt.adjustColorForTheme = (color) => mapColorForTheme(color, rt.canvasBgColor, rt.isLightMode);

rt.ensureWorld = () => {
  if (!rt.world) {
    rt.world = new OffscreenCanvas(rt.worldW, rt.worldH);
    rt.worldCtx = rt.world.getContext('2d');
    if (rt.worldCtx) {
      rt.worldCtx.imageSmoothingEnabled = false;
      rt.worldCtx.fillStyle = rt.canvasBgColor;
      rt.worldCtx.fillRect(0, 0, rt.worldW, rt.worldH);
    }
  }
};

rt.drawStrokeToWorld = (stroke: Stroke) => {
  if (!stroke.groupId) {
    console.warn('Stroke without groupId - skipping consolidation');
    return;
  }
  const groupId = stroke.groupId;
  let path = rt.consolidatedPaths.get(groupId);
  if (!path) {
    path = {
      groupId,
      color: stroke.color,
      size: stroke.size,
      alpha: stroke.alpha ?? 1,
      points: [{ x: stroke.x0, y: stroke.y0, width: stroke.size }],
      maxWidth: stroke.size,
      bounds: { minX: stroke.x0, minY: stroke.y0, maxX: stroke.x0, maxY: stroke.y0 },
    };
    rt.consolidatedPaths.set(groupId, path);
  }
  path.points.push({ x: stroke.x1, y: stroke.y1, width: stroke.size });
  path.maxWidth = Math.max(path.maxWidth, stroke.size);
  path.bounds.minX = Math.min(path.bounds.minX, stroke.x1);
  path.bounds.minY = Math.min(path.bounds.minY, stroke.y1);
  path.bounds.maxX = Math.max(path.bounds.maxX, stroke.x1);
  path.bounds.maxY = Math.max(path.bounds.maxY, stroke.y1);
};

rt.drawDrawingToWorld = (drawing: Drawing) => {
  const existingIndex = rt.retainedDrawings.findIndex((candidate) => candidate.id === drawing.id);
  if (existingIndex >= 0) {
    rt.retainedDrawings[existingIndex] = drawing;
  } else {
    rt.retainedDrawings.push(drawing);
  }
  if (drawing.type === 'image' && drawing.imageData) {
    if (!rt.imageBitmapCache.has(drawing.imageData)) {
      rt.loadImageBitmap(drawing.imageData)
        .then(() => {
          rt.scheduleBlit();
        })
        .catch(() => {
          // Failed to load, but don't block rendering
        });
    }
  }
};

const { scheduleBlit } = createWorkerBlit(rt);
rt.scheduleBlit = scheduleBlit;

self.onmessage = (event) => handleRendererMessage(event, rt);
