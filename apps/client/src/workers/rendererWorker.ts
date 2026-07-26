/// <reference lib="webworker" />

import { objectIntersectsViewport } from '../lib/viewportCulling';

export {};

declare const self: DedicatedWorkerGlobalScope;
/*
  OffscreenCanvas renderer worker. Handles drawing and compositing off the main thread.
*/

type InitMessage = {
  type: 'init';
  canvas: OffscreenCanvas;
  worldWidth: number;
  worldHeight: number;
};

type Stroke = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  color: string;
  size: number;
  alpha?: number;
  groupId?: string;
};

type StrokeMessage = {
  type: 'stroke' | 'strokes';
  data: Stroke | Stroke[];
};

type Shape = {
  id: string;
  type:
    | 'stroke'
    | 'line'
    | 'rectangle'
    | 'ellipse'
    | 'circle'
    | 'triangle'
    | 'parabola'
    | 'text'
    | 'image'
    | 'arrow'
    | 'star';
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  size: number;
  alpha: number;
  filled?: boolean;
  orientation?: 'up' | 'down' | 'left' | 'right';
  points?: { x: number; y: number; width?: number }[]; // Strokes, custom triangle vertices, arrows
  text?: string;
  fontSize?: number;
  imageData?: string; // Base64 data URL for images
  properties?: Record<string, unknown>; // Shape-specific properties (e.g., star point count)
};

type PathContext = Pick<OffscreenCanvasRenderingContext2D, 'moveTo' | 'lineTo'>;
type ParabolaShape = Pick<Shape, 'x' | 'y' | 'width' | 'height' | 'orientation' | 'points'>;

/** Trace an authored parabola path when present, otherwise the legacy preset curve. */
function traceParabolaPath(context: PathContext, shape: ParabolaShape) {
  if (shape.points && shape.points.length > 1) {
    context.moveTo(shape.points[0].x, shape.points[0].y);
    for (const point of shape.points.slice(1)) context.lineTo(point.x, point.y);
    return;
  }

  const steps = 64;
  const x0 = shape.x,
    y0 = shape.y,
    w = shape.width,
    h = shape.height;
  if (shape.orientation === 'left' || shape.orientation === 'right') {
    const dir = shape.orientation === 'right' ? 1 : -1;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const yy = y0 + t * h;
      const ny = (t - 0.5) * 2;
      const xx = x0 + (dir > 0 ? 0 : w) + dir * w * (ny * ny);
      if (i === 0) context.moveTo(xx, yy);
      else context.lineTo(xx, yy);
    }
  } else {
    const dir = shape.orientation === 'down' ? 1 : -1;
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

// Cache for loaded image bitmaps
const imageBitmapCache = new Map<string, ImageBitmap>();

async function loadImageBitmap(dataUrl: string): Promise<ImageBitmap | null> {
  if (imageBitmapCache.has(dataUrl)) {
    return imageBitmapCache.get(dataUrl)!;
  }
  try {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);
    imageBitmapCache.set(dataUrl, bitmap);
    return bitmap;
  } catch {
    return null;
  }
}

type ShapeMessage = {
  type: 'shape';
  data: Shape;
};
type ClearShapeMessage = {
  type: 'clear-shape';
  data: Shape;
};

type ViewportMessage = {
  type: 'viewport';
  zoom: number;
  viewX: number;
  viewY: number;
  canvasWidth: number;
  canvasHeight: number;
  dpr: number;
  sequence?: number;
};

type ClearMessage = { type: 'clear' };
type ClearRegionMessage = {
  type: 'clear-region';
  x: number;
  y: number;
  width: number;
  height: number;
};
type RemoveGroupMessage = { type: 'remove-group'; groupId: string };
type SnapshotMessage = { type: 'snapshot' };
type SnapshotImageMessage = {
  type: 'snapshot-image';
  dataUrl: string;
  worldWidth?: number;
  worldHeight?: number;
};
type ThemeMessage = { type: 'theme'; bgColor: string };
type LoadObjectsMessage = { type: 'load-objects'; data: Shape[] };
type LoadSceneMessage = {
  type: 'load-scene';
  requestId: string;
  shapes: Shape[];
  strokes: Stroke[];
};

type Inbound =
  | InitMessage
  | StrokeMessage
  | ShapeMessage
  | ViewportMessage
  | ClearMessage
  | ClearRegionMessage
  | RemoveGroupMessage
  | ClearShapeMessage
  | SnapshotMessage
  | SnapshotImageMessage
  | ThemeMessage
  | LoadObjectsMessage
  | LoadSceneMessage;

type Outbound =
  | { type: 'snapshot'; dataUrl: string }
  | { type: 'ready' }
  | { type: 'init-error'; reason: string }
  | { type: 'scene-applied'; requestId: string; objectCount: number; ingestionMs: number }
  | {
      type: 'frame-rendered';
      requestId?: string;
      viewportSequence?: number;
      renderMs: number;
      retainedObjectCount: number;
      visibleObjectCount: number;
      culledObjectCount: number;
    };

let screenCtx: OffscreenCanvasRenderingContext2D | null = null;
let world: OffscreenCanvas | null = null;
let worldCtx: OffscreenCanvasRenderingContext2D | null = null;
let worldW = 51200; // 20x 1440p width (2560 × 20)
let worldH = 28800; // 20x 1440p height (1440 × 20)

// Retained vector model for precise zoom rendering
const retainedShapes: Shape[] = [];

// Consolidated stroke paths for efficient rendering
interface ConsolidatedPath {
  groupId: string;
  color: string;
  size: number;
  alpha: number;
  points: { x: number; y: number }[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}
const consolidatedPaths: Map<string, ConsolidatedPath> = new Map();

let lastViewport: ViewportMessage = {
  type: 'viewport',
  zoom: 1,
  viewX: 0,
  viewY: 0,
  canvasWidth: 0,
  canvasHeight: 0,
  dpr: 1,
  sequence: undefined as number | undefined,
};

let lastBlitTime = 0;
let lastSceneRequestId: string | undefined;
let blitScheduled = false;
let blitTimer: number | null = null;
const BLIT_INTERVAL_MS = 1000 / 60; // ~60 FPS cap

// Theme-aware background color (default dark - must match canvas wrapper bg)
let canvasBgColor = '#0a0a0a';
let isLightMode = false;

// Color contrast adjustment for theme switching
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  // Handle shorthand hex
  const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  hex = hex.replace(shorthandRegex, (_, r, g, b) => r + r + g + g + b + b);

  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

function rgbToHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [r, g, b]
      .map((x) => {
        const hex = Math.round(Math.max(0, Math.min(255, x))).toString(16);
        return hex.length === 1 ? '0' + hex : hex;
      })
      .join('')
  );
}

function getLuminance(r: number, g: number, b: number): number {
  // Relative luminance formula
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

// Known background colors that should never be adjusted - eraser strokes use these
// Must match BG_COLORS in DrawingCanvas.tsx
const BG_COLORS = ['#020617', '#f8fafc', '#0a0a0a', '#e0e0e0'];

function isBackgroundColor(color: string): boolean {
  const normalized = color.toLowerCase();
  return BG_COLORS.includes(normalized);
}

function adjustColorForTheme(color: string): string {
  // Always convert eraser/background strokes to current background color
  // This ensures eraser strokes from saved projects (which may have used a different theme's background)
  // always match the current theme's background
  const normalizedColor = color.toLowerCase();
  if (isBackgroundColor(normalizedColor)) {
    return canvasBgColor;
  }

  // If we're in dark mode, no adjustment needed (colors drawn as-is)
  if (!isLightMode) return color;

  // Handle rgba colors
  const rgbaMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (rgbaMatch) {
    const r = parseInt(rgbaMatch[1]);
    const g = parseInt(rgbaMatch[2]);
    const b = parseInt(rgbaMatch[3]);
    const a = rgbaMatch[4] ? parseFloat(rgbaMatch[4]) : 1;

    const luminance = getLuminance(r, g, b);

    // Invert colors based on luminance for light mode
    // High luminance colors (light colors like white) become dark
    // Low luminance colors (dark colors like black) become light
    if (luminance > 0.7) {
      // Light color -> make it dark
      const factor = 1 - luminance;
      const newR = Math.round(r * factor * 0.3);
      const newG = Math.round(g * factor * 0.3);
      const newB = Math.round(b * factor * 0.3);
      return a < 1 ? `rgba(${newR}, ${newG}, ${newB}, ${a})` : `rgb(${newR}, ${newG}, ${newB})`;
    } else if (luminance < 0.15) {
      // Very dark color -> make it lighter but not too light
      const newR = Math.min(255, r + 180);
      const newG = Math.min(255, g + 180);
      const newB = Math.min(255, b + 180);
      return a < 1 ? `rgba(${newR}, ${newG}, ${newB}, ${a})` : `rgb(${newR}, ${newG}, ${newB})`;
    }

    return color;
  }

  // Handle hex colors
  const rgb = hexToRgb(color);
  if (!rgb) return color;

  const luminance = getLuminance(rgb.r, rgb.g, rgb.b);

  // Invert based on luminance
  if (luminance > 0.7) {
    // Light color -> make it dark (invert)
    const factor = 1 - luminance;
    return rgbToHex(
      Math.round(rgb.r * factor * 0.3),
      Math.round(rgb.g * factor * 0.3),
      Math.round(rgb.b * factor * 0.3),
    );
  } else if (luminance < 0.15) {
    // Very dark color -> make it lighter
    return rgbToHex(
      Math.min(255, rgb.r + 180),
      Math.min(255, rgb.g + 180),
      Math.min(255, rgb.b + 180),
    );
  }

  // Mid-range colors: slight adjustment for better contrast
  if (luminance > 0.4 && luminance <= 0.7) {
    // Slightly darken mid-light colors
    return rgbToHex(Math.round(rgb.r * 0.7), Math.round(rgb.g * 0.7), Math.round(rgb.b * 0.7));
  }

  return color;
}

function getStarPointCount(shape: { properties?: Record<string, unknown> }): number {
  const value = shape.properties?.pointCount;
  return typeof value === 'number' && Number.isInteger(value) && value >= 3 && value <= 64
    ? value
    : 5;
}

function applyObjectRotation(
  context: OffscreenCanvasRenderingContext2D,
  shape: {
    x: number;
    y: number;
    width: number;
    height: number;
    properties?: Record<string, unknown>;
  },
) {
  const degrees = Number(shape.properties?.rotation ?? 0);
  if (!Number.isFinite(degrees) || degrees === 0) return;
  const centerX = shape.x + shape.width / 2;
  const centerY = shape.y + shape.height / 2;
  context.translate(centerX, centerY);
  context.rotate((degrees * Math.PI) / 180);
  context.translate(-centerX, -centerY);
}

// Supersampled anti-aliased vector rendering
// Base factor; actual factor is dynamic per frame
const SSAA_FACTOR = 1; // default, may be overridden dynamically
const MAX_SSAA_PIXELS = 8000000; // ~8MP budget to avoid OOM
const MAX_OFFSCREEN_DIM = 8192; // max width/height for offscreen buffers
let vectorSS: OffscreenCanvas | null = null;
let vectorSSCtx: OffscreenCanvasRenderingContext2D | null = null;
function ensureVectorSS(targetW: number, targetH: number, ss: number) {
  const w = Math.max(1, Math.floor(targetW * ss));
  const h = Math.max(1, Math.floor(targetH * ss));
  if (vectorSS && vectorSS.width === w && vectorSS.height === h && vectorSSCtx) return true;
  try {
    vectorSS = new OffscreenCanvas(w, h);
    vectorSSCtx = vectorSS.getContext('2d');
    if (vectorSSCtx) {
      vectorSSCtx.imageSmoothingEnabled = false;
      return true;
    }
  } catch {
    // Allocation failed; drop SSAA
  }
  vectorSS = null;
  vectorSSCtx = null;
  return false;
}

function getSnappedWorldLineWidth(lineWidthWorld: number, zoom: number, dpr: number) {
  const deviceWidth = Math.max(0, lineWidthWorld * zoom * dpr);
  const nearest = Math.round(deviceWidth);
  const frac = Math.abs(deviceWidth - nearest);
  // Proximity to integer in [0,1], where 1 means very close to integer
  const proximity = 1 - Math.min(frac, 1 - frac);
  // Threshold after which we snap; below we use raw width
  const SNAP_THRESHOLD = 0.85;
  if (nearest >= 1 && proximity >= SNAP_THRESHOLD) {
    const worldWidth = nearest / (zoom * dpr);
    const offset = (nearest & 1) === 1 ? 0.5 / (dpr * zoom) : 0;
    return { worldWidth, offset, snapped: true } as const;
  }
  return { worldWidth: lineWidthWorld, offset: 0, snapped: false } as const;
}

function ensureWorld() {
  if (!world) {
    world = new OffscreenCanvas(worldW, worldH);
    worldCtx = world.getContext('2d');
    if (worldCtx) {
      worldCtx.imageSmoothingEnabled = false;
      worldCtx.fillStyle = canvasBgColor;
      worldCtx.fillRect(0, 0, worldW, worldH);
    }
  }
}

function drawStrokeToWorld(stroke: Stroke) {
  // Every stroke MUST have a unique groupId - don't fall back to 'default'
  // If no groupId is provided, skip consolidation and just return
  if (!stroke.groupId) {
    console.warn('Stroke without groupId - skipping consolidation');
    return;
  }

  const groupId = stroke.groupId;
  let path = consolidatedPaths.get(groupId);
  if (!path) {
    path = {
      groupId,
      color: stroke.color,
      size: stroke.size,
      alpha: stroke.alpha ?? 1,
      points: [{ x: stroke.x0, y: stroke.y0 }],
      bounds: { minX: stroke.x0, minY: stroke.y0, maxX: stroke.x0, maxY: stroke.y0 },
    };
    consolidatedPaths.set(groupId, path);
  }
  path.points.push({ x: stroke.x1, y: stroke.y1 });
  // Update bounds
  path.bounds.minX = Math.min(path.bounds.minX, stroke.x1);
  path.bounds.minY = Math.min(path.bounds.minY, stroke.y1);
  path.bounds.maxX = Math.max(path.bounds.maxX, stroke.x1);
  path.bounds.maxY = Math.max(path.bounds.maxY, stroke.y1);
}

function drawShapeToWorld(shape: Shape) {
  // Check if shape already exists (for updates during dragging)
  const existingIndex = retainedShapes.findIndex((s) => s.id === shape.id);
  if (existingIndex >= 0) {
    // Update existing shape
    retainedShapes[existingIndex] = shape;
  } else {
    // Add new shape
    retainedShapes.push(shape);
  }

  // Preload image if it's an image shape - load immediately
  if (shape.type === 'image' && shape.imageData) {
    if (!imageBitmapCache.has(shape.imageData)) {
      loadImageBitmap(shape.imageData)
        .then(() => {
          scheduleBlit(); // Re-render once image is loaded
        })
        .catch(() => {
          // Failed to load, but don't block rendering
        });
    }
  }
}

function blit() {
  if (!screenCtx) return;
  const renderStartedAt = performance.now();

  const { zoom, viewX, viewY, canvasWidth, canvasHeight, dpr } = lastViewport;

  const safeDpr = dpr || 1;
  const targetW = Math.max(1, Math.floor(canvasWidth * safeDpr));
  const targetH = Math.max(1, Math.floor(canvasHeight * safeDpr));
  if (screenCtx.canvas.width !== targetW || screenCtx.canvas.height !== targetH) {
    screenCtx.canvas.width = targetW;
    screenCtx.canvas.height = targetH;
  }

  // Clear in device pixel space
  screenCtx.save();
  screenCtx.setTransform(1, 0, 0, 1, 0, 0);
  screenCtx.fillStyle = canvasBgColor;
  screenCtx.fillRect(0, 0, targetW, targetH);

  // Determine dynamic SSAA factor with safety caps - keep it low for performance
  const vectorCount = consolidatedPaths.size + retainedShapes.length;
  // Use lower SSAA during active drawing (many paths) for responsiveness
  const maxSSAA = vectorCount > 50 ? 1 : 2;
  const dynamicSSAA = Math.max(1, Math.min(maxSSAA, Math.round(zoom * safeDpr)));

  // Compute safe ssaa factor under pixel budget and dimension caps
  const desiredFactor = Math.max(SSAA_FACTOR, dynamicSSAA);
  let ssaaFactor = desiredFactor;
  const capByDim = (dim: number, target: number) =>
    Math.max(1, Math.floor(dim / Math.max(1, target)));
  if (Math.floor(targetW * ssaaFactor) > MAX_OFFSCREEN_DIM)
    ssaaFactor = Math.min(ssaaFactor, capByDim(MAX_OFFSCREEN_DIM, targetW));
  if (Math.floor(targetH * ssaaFactor) > MAX_OFFSCREEN_DIM)
    ssaaFactor = Math.min(ssaaFactor, capByDim(MAX_OFFSCREEN_DIM, targetH));
  while (
    Math.floor(targetW * ssaaFactor) * Math.floor(targetH * ssaaFactor) > MAX_SSAA_PIXELS &&
    ssaaFactor > 1
  )
    ssaaFactor--;

  // Draw raster world in screen space with adaptive smoothing unless we choose to skip
  const shouldSkipRaster = vectorCount > 0 && zoom >= 1.15;
  if (world && !shouldSkipRaster) {
    const anyCtx = screenCtx as unknown as {
      imageSmoothingEnabled?: boolean;
      imageSmoothingQuality?: 'low' | 'medium' | 'high';
    };
    const scale = zoom * safeDpr;
    const frac = Math.abs(scale - Math.round(scale));
    const shouldSmooth = frac > 0.05 || scale < 1;
    anyCtx.imageSmoothingEnabled = shouldSmooth;
    anyCtx.imageSmoothingQuality = 'high';

    const srcX = viewX;
    const srcY = viewY;
    const srcW = canvasWidth / Math.max(zoom, 0.0001);
    const srcH = canvasHeight / Math.max(zoom, 0.0001);

    screenCtx.drawImage(world, srcX, srcY, srcW, srcH, 0, 0, targetW, targetH);

    anyCtx.imageSmoothingEnabled = false;
  }
  screenCtx.restore();

  // Compute current world viewport for culling
  const vx1 = viewX;
  const vy1 = viewY;
  const vx2 = viewX + canvasWidth / Math.max(zoom, 0.0001);
  const vy2 = viewY + canvasHeight / Math.max(zoom, 0.0001);
  const visibleShapeCount = retainedShapes.filter((shape) =>
    objectIntersectsViewport(shape, vx1, vy1, vx2, vy2),
  ).length;
  const visiblePathCount = Array.from(consolidatedPaths.values()).filter((path) => {
    const margin = path.size;
    return !(
      path.bounds.maxX + margin < vx1 ||
      path.bounds.minX - margin > vx2 ||
      path.bounds.maxY + margin < vy1 ||
      path.bounds.minY - margin > vy2
    );
  }).length;

  // Supersampled vector render, then composite
  if (ssaaFactor > 1 && ensureVectorSS(targetW, targetH, ssaaFactor) && vectorSSCtx && vectorSS) {
    // Clear supersampled buffer fully transparent
    vectorSSCtx.save();
    vectorSSCtx.setTransform(1, 0, 0, 1, 0, 0);
    vectorSSCtx.clearRect(0, 0, vectorSS.width, vectorSS.height);
    vectorSSCtx.restore();

    const ssDpr = safeDpr * ssaaFactor;

    // World transform at supersampled resolution
    vectorSSCtx.save();
    vectorSSCtx.scale(ssDpr, ssDpr);
    const rawTx = -viewX * zoom;
    const rawTy = -viewY * zoom;
    const snappedTx = Math.round(rawTx * ssDpr) / ssDpr;
    const snappedTy = Math.round(rawTy * ssDpr) / ssDpr;
    vectorSSCtx.translate(snappedTx, snappedTy);
    vectorSSCtx.scale(zoom, zoom);

    // Draw images first (in background)
    for (let i = 0; i < retainedShapes.length; i++) {
      const sh = retainedShapes[i] as unknown as {
        type:
          | 'stroke'
          | 'line'
          | 'rectangle'
          | 'ellipse'
          | 'circle'
          | 'triangle'
          | 'parabola'
          | 'text'
          | 'image'
          | 'arrow'
          | 'star';
        x: number;
        y: number;
        width: number;
        height: number;
        color: string;
        size: number;
        alpha?: number;
        filled?: boolean;
        orientation?: 'up' | 'down' | 'left' | 'right';
        points?: { x: number; y: number; width?: number }[];
        text?: string;
        fontSize?: number;
        imageData?: string;
        properties?: Record<string, unknown>;
      };
      if (sh.type === 'image' && sh.imageData && !sh.properties?.hidden) {
        // Check viewport intersection for images (they can be large)
        if (objectIntersectsViewport(sh, vx1, vy1, vx2, vy2)) {
          const bitmap = imageBitmapCache.get(sh.imageData);
          if (bitmap) {
            vectorSSCtx.save();
            vectorSSCtx.globalAlpha = sh.alpha ?? 1;
            applyObjectRotation(vectorSSCtx, sh);
            vectorSSCtx.drawImage(bitmap, sh.x, sh.y, sh.width, sh.height);
            vectorSSCtx.restore();
          } else {
            // Image not loaded yet, try to load it
            loadImageBitmap(sh.imageData).then(() => {
              scheduleBlit(); // Re-render once loaded
            });
          }
        }
      }
    }

    // Draw consolidated paths first (batched strokes for performance)
    for (const [, path] of consolidatedPaths) {
      // Viewport culling using bounds
      const margin = path.size;
      if (
        path.bounds.maxX + margin < vx1 ||
        path.bounds.minX - margin > vx2 ||
        path.bounds.maxY + margin < vy1 ||
        path.bounds.minY - margin > vy2
      )
        continue;

      const isEraserPath = isBackgroundColor(path.color);

      vectorSSCtx.save();
      if (isEraserPath) {
        vectorSSCtx.globalCompositeOperation = 'destination-out';
        vectorSSCtx.strokeStyle = '#000000';
      } else {
        vectorSSCtx.strokeStyle = adjustColorForTheme(path.color);
      }
      vectorSSCtx.lineWidth = path.size;
      vectorSSCtx.globalAlpha = path.alpha;
      vectorSSCtx.lineCap = 'round';
      vectorSSCtx.lineJoin = 'round';

      // Draw entire path in one go - much faster than individual segments
      if (path.points.length > 0) {
        vectorSSCtx.beginPath();
        vectorSSCtx.moveTo(path.points[0].x, path.points[0].y);
        for (let i = 1; i < path.points.length; i++) {
          vectorSSCtx.lineTo(path.points[i].x, path.points[i].y);
        }
        vectorSSCtx.stroke();
      }
      vectorSSCtx.restore();
    }

    for (let i = 0; i < retainedShapes.length; i++) {
      const sh = retainedShapes[i] as unknown as {
        type:
          | 'stroke'
          | 'line'
          | 'rectangle'
          | 'ellipse'
          | 'circle'
          | 'triangle'
          | 'parabola'
          | 'text'
          | 'image'
          | 'arrow'
          | 'star';
        x: number;
        y: number;
        width: number;
        height: number;
        color: string;
        size: number;
        alpha?: number;
        filled?: boolean;
        orientation?: 'up' | 'down' | 'left' | 'right';
        points?: { x: number; y: number; width?: number }[];
        text?: string;
        fontSize?: number;
        imageData?: string;
        properties?: Record<string, unknown>;
      };
      if (sh.properties?.hidden) continue;
      // Skip images - already rendered above
      if (sh.type === 'image') continue;
      // For text, check position directly (text might have 0 width/height from old projects)
      if (sh.type === 'stroke') {
        // Point-based strokes do not have a meaningful x/y bounding box.
        // Keep them in the ordered scene and let their segment renderer clip.
      } else if (sh.type === 'text') {
        if (sh.x < vx1 || sh.x > vx2 || sh.y < vy1 || sh.y > vy2) continue;
      } else {
        if (!objectIntersectsViewport(sh, vx1, vy1, vx2, vy2)) continue;
      }
      const adjustedShColor = adjustColorForTheme(sh.color);
      vectorSSCtx.save();
      vectorSSCtx.strokeStyle = adjustedShColor;
      vectorSSCtx.lineWidth = sh.size;
      vectorSSCtx.globalAlpha = sh.alpha ?? 1;
      vectorSSCtx.lineCap = 'round';
      vectorSSCtx.lineJoin = 'round';
      vectorSSCtx.fillStyle = adjustedShColor;
      applyObjectRotation(vectorSSCtx, sh);
      vectorSSCtx.beginPath();
      if (sh.type === 'stroke' && sh.points && sh.points.length > 1) {
        for (let pointIndex = 1; pointIndex < sh.points.length; pointIndex++) {
          const previous = sh.points[pointIndex - 1];
          const point = sh.points[pointIndex];
          vectorSSCtx.beginPath();
          vectorSSCtx.moveTo(previous.x, previous.y);
          vectorSSCtx.lineTo(point.x, point.y);
          vectorSSCtx.lineWidth = point.width ?? sh.size;
          vectorSSCtx.stroke();
        }
      } else if (sh.type === 'line') {
        vectorSSCtx.moveTo(sh.x, sh.y);
        vectorSSCtx.lineTo(sh.x + sh.width, sh.y + sh.height);
        vectorSSCtx.stroke();
      } else if (sh.type === 'rectangle') {
        if (sh.filled) vectorSSCtx.fillRect(sh.x, sh.y, sh.width, sh.height);
        vectorSSCtx.strokeRect(sh.x, sh.y, sh.width, sh.height);
      } else if (sh.type === 'ellipse') {
        const cx = sh.x + sh.width / 2;
        const cy = sh.y + sh.height / 2;
        const rx = sh.width / 2;
        const ry = sh.height / 2;
        vectorSSCtx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
        if (sh.filled) vectorSSCtx.fill();
        vectorSSCtx.stroke();
      } else if (sh.type === 'triangle') {
        // Draw triangle using custom vertices if available, otherwise default isosceles
        let x1, y1, x2, y2, x3, y3;

        if (sh.points && sh.points.length === 3) {
          // Use custom vertices
          x1 = sh.points[0].x;
          y1 = sh.points[0].y;
          x2 = sh.points[1].x;
          y2 = sh.points[1].y;
          x3 = sh.points[2].x;
          y3 = sh.points[2].y;
        } else {
          // Default isosceles triangle with apex at top-center
          x1 = sh.x + sh.width / 2; // top center (apex)
          y1 = sh.y;
          x2 = sh.x; // bottom left
          y2 = sh.y + sh.height;
          x3 = sh.x + sh.width; // bottom right
          y3 = sh.y + sh.height;
        }

        vectorSSCtx.moveTo(x1, y1);
        vectorSSCtx.lineTo(x2, y2);
        vectorSSCtx.lineTo(x3, y3);
        vectorSSCtx.closePath();

        if (sh.filled) vectorSSCtx.fill();
        vectorSSCtx.stroke();
      } else if (sh.type === 'parabola') {
        traceParabolaPath(vectorSSCtx, sh);
        vectorSSCtx.stroke();
      } else if (sh.type === 'text' && sh.text) {
        vectorSSCtx.fillStyle = adjustedShColor;
        const fontSize = sh.fontSize || 24;
        vectorSSCtx.font = `${fontSize}px Inter, system-ui, sans-serif`;
        vectorSSCtx.textBaseline = 'top';
        const lines = sh.text.split('\n');
        const lineHeight = fontSize * 1.4;
        for (let i = 0; i < lines.length; i++) {
          vectorSSCtx.fillText(lines[i], sh.x, sh.y + i * lineHeight);
        }
      } else if (sh.type === 'star') {
        // Draw 5-pointed star
        const cx = sh.x + sh.width / 2;
        const cy = sh.y + sh.height / 2;
        const outerRadius = Math.min(sh.width, sh.height) / 2;
        const innerRadius = outerRadius * 0.38;
        const pointCount = getStarPointCount(sh);

        vectorSSCtx.beginPath();
        for (let i = 0; i < pointCount * 2; i++) {
          const angle = (i * Math.PI) / pointCount - Math.PI / 2;
          const radius = i % 2 === 0 ? outerRadius : innerRadius;
          const x = cx + radius * Math.cos(angle);
          const y = cy + radius * Math.sin(angle);
          if (i === 0) {
            vectorSSCtx.moveTo(x, y);
          } else {
            vectorSSCtx.lineTo(x, y);
          }
        }
        vectorSSCtx.closePath();

        if (sh.filled) vectorSSCtx.fill();
        vectorSSCtx.stroke();
      } else if (sh.type === 'arrow') {
        // Draw arrow with shaft and head
        if (sh.points && sh.points.length >= 2) {
          const start = sh.points[0];
          const end = sh.points[1];

          // Draw shaft
          vectorSSCtx.beginPath();
          vectorSSCtx.moveTo(start.x, start.y);
          vectorSSCtx.lineTo(end.x, end.y);
          vectorSSCtx.stroke();

          // Draw arrowhead
          const angle = Math.atan2(end.y - start.y, end.x - start.x);
          const headLength = 15;
          const headAngle = Math.PI / 6;

          const wing1 = {
            x: end.x - headLength * Math.cos(angle - headAngle),
            y: end.y - headLength * Math.sin(angle - headAngle),
          };
          const wing2 = {
            x: end.x - headLength * Math.cos(angle + headAngle),
            y: end.y - headLength * Math.sin(angle + headAngle),
          };

          vectorSSCtx.beginPath();
          vectorSSCtx.moveTo(wing1.x, wing1.y);
          vectorSSCtx.lineTo(end.x, end.y);
          vectorSSCtx.lineTo(wing2.x, wing2.y);
          vectorSSCtx.stroke();
        }
      }
      // Note: images are handled separately above (before this loop skips them with continue)
      vectorSSCtx.restore();
    }

    vectorSSCtx.restore();

    // Composite SS buffer to screen at device resolution
    const anyCtx = screenCtx as unknown as {
      imageSmoothingEnabled?: boolean;
      imageSmoothingQuality?: 'low' | 'medium' | 'high';
    };
    anyCtx.imageSmoothingEnabled = true;
    anyCtx.imageSmoothingQuality = 'high';
    screenCtx.save();
    screenCtx.setTransform(1, 0, 0, 1, 0, 0);
    screenCtx.drawImage(vectorSS, 0, 0, vectorSS.width, vectorSS.height, 0, 0, targetW, targetH);
    screenCtx.restore();
    anyCtx.imageSmoothingEnabled = false;
    const retainedObjectCount = retainedShapes.length + consolidatedPaths.size;
    self.postMessage({
      type: 'frame-rendered',
      requestId: lastSceneRequestId,
      viewportSequence: lastViewport.sequence,
      renderMs: performance.now() - renderStartedAt,
      retainedObjectCount,
      visibleObjectCount: visibleShapeCount + visiblePathCount,
      culledObjectCount: retainedObjectCount - visibleShapeCount - visiblePathCount,
    } satisfies Outbound);
    return;
  }

  // Fallback: draw vectors directly (if SSAA disabled or allocation failed), with culling
  screenCtx.save();
  screenCtx.scale(safeDpr, safeDpr);
  const rawTx = -viewX * zoom;
  const rawTy = -viewY * zoom;
  const snappedTx = Math.round(rawTx * safeDpr) / safeDpr;
  const snappedTy = Math.round(rawTy * safeDpr) / safeDpr;
  screenCtx.translate(snappedTx, snappedTy);
  screenCtx.scale(zoom, zoom);

  // Draw images first (in background)
  for (let i = 0; i < retainedShapes.length; i++) {
    const sh = retainedShapes[i] as unknown as {
      type:
        | 'stroke'
        | 'line'
        | 'rectangle'
        | 'ellipse'
        | 'circle'
        | 'triangle'
        | 'parabola'
        | 'text'
        | 'image'
        | 'arrow'
        | 'star';
      x: number;
      y: number;
      width: number;
      height: number;
      color: string;
      size: number;
      alpha?: number;
      filled?: boolean;
      orientation?: 'up' | 'down' | 'left' | 'right';
      points?: { x: number; y: number; width?: number }[];
      text?: string;
      fontSize?: number;
      imageData?: string;
      properties?: Record<string, unknown>;
    };
    if (
      sh.type === 'image' &&
      sh.imageData &&
      !sh.properties?.hidden &&
      objectIntersectsViewport(sh, vx1, vy1, vx2, vy2)
    ) {
      const bitmap = imageBitmapCache.get(sh.imageData);
      if (bitmap) {
        screenCtx.save();
        screenCtx.globalAlpha = sh.alpha ?? 1;
        applyObjectRotation(screenCtx, sh);
        screenCtx.drawImage(bitmap, sh.x, sh.y, sh.width, sh.height);
        screenCtx.restore();
      } else {
        // Image not loaded yet, try to load it
        loadImageBitmap(sh.imageData).then(() => {
          scheduleBlit(); // Re-render once loaded
        });
      }
    }
  }

  // Draw consolidated paths first (batched strokes for performance)
  for (const [, path] of consolidatedPaths) {
    // Viewport culling using bounds
    const margin = path.size;
    if (
      path.bounds.maxX + margin < vx1 ||
      path.bounds.minX - margin > vx2 ||
      path.bounds.maxY + margin < vy1 ||
      path.bounds.minY - margin > vy2
    )
      continue;

    const isEraserPath = isBackgroundColor(path.color);

    screenCtx.save();
    if (isEraserPath) {
      screenCtx.globalCompositeOperation = 'destination-out';
      screenCtx.strokeStyle = '#000000';
    } else {
      screenCtx.strokeStyle = adjustColorForTheme(path.color);
    }
    const snap = getSnappedWorldLineWidth(path.size, zoom, safeDpr);
    screenCtx.lineWidth = snap.worldWidth;
    screenCtx.globalAlpha = path.alpha;
    screenCtx.lineCap = 'round';
    screenCtx.lineJoin = 'round';
    if (snap.snapped && snap.offset !== 0) {
      screenCtx.translate(snap.offset, snap.offset);
    }

    // Draw entire path in one go
    if (path.points.length > 0) {
      screenCtx.beginPath();
      screenCtx.moveTo(path.points[0].x, path.points[0].y);
      for (let i = 1; i < path.points.length; i++) {
        screenCtx.lineTo(path.points[i].x, path.points[i].y);
      }
      screenCtx.stroke();
    }
    screenCtx.restore();
  }

  for (let i = 0; i < retainedShapes.length; i++) {
    const sh = retainedShapes[i] as unknown as {
      type:
        | 'stroke'
        | 'line'
        | 'rectangle'
        | 'ellipse'
        | 'circle'
        | 'triangle'
        | 'parabola'
        | 'text'
        | 'image'
        | 'arrow'
        | 'star';
      x: number;
      y: number;
      width: number;
      height: number;
      color: string;
      size: number;
      alpha?: number;
      filled?: boolean;
      orientation?: 'up' | 'down' | 'left' | 'right';
      points?: { x: number; y: number; width?: number }[];
      text?: string;
      fontSize?: number;
      imageData?: string;
      properties?: Record<string, unknown>;
    };
    if (sh.properties?.hidden) continue;
    // Skip images - already rendered above
    if (sh.type === 'image') continue;
    // For text, check position directly (text might have 0 width/height from old projects)
    if (sh.type === 'stroke') {
      // Point-based strokes do not have a meaningful x/y bounding box.
      // Keep them in the ordered scene and let their segment renderer clip.
    } else if (sh.type === 'text') {
      if (sh.x < vx1 || sh.x > vx2 || sh.y < vy1 || sh.y > vy2) continue;
    } else {
      if (!objectIntersectsViewport(sh, vx1, vy1, vx2, vy2)) continue;
    }
    const adjustedColor = adjustColorForTheme(sh.color);
    screenCtx.save();
    screenCtx.strokeStyle = adjustedColor;
    const snap = getSnappedWorldLineWidth(sh.size, zoom, safeDpr);
    screenCtx.lineWidth = snap.worldWidth;
    screenCtx.globalAlpha = sh.alpha ?? 1;
    screenCtx.lineCap = 'round';
    screenCtx.lineJoin = 'round';
    screenCtx.fillStyle = adjustedColor;
    applyObjectRotation(screenCtx, sh);
    if (snap.snapped && snap.offset !== 0) {
      screenCtx.translate(snap.offset, snap.offset);
    }
    screenCtx.beginPath();
    if (sh.type === 'stroke' && sh.points && sh.points.length > 1) {
      for (let pointIndex = 1; pointIndex < sh.points.length; pointIndex++) {
        const previous = sh.points[pointIndex - 1];
        const point = sh.points[pointIndex];
        screenCtx.beginPath();
        screenCtx.moveTo(previous.x, previous.y);
        screenCtx.lineTo(point.x, point.y);
        screenCtx.lineWidth = point.width ?? sh.size;
        screenCtx.stroke();
      }
    } else if (sh.type === 'line') {
      screenCtx.moveTo(sh.x, sh.y);
      screenCtx.lineTo(sh.x + sh.width, sh.y + sh.height);
      screenCtx.stroke();
    } else if (sh.type === 'rectangle') {
      if (sh.filled) {
        screenCtx.fillRect(sh.x, sh.y, sh.width, sh.height);
      }
      screenCtx.strokeRect(sh.x, sh.y, sh.width, sh.height);
    } else if (sh.type === 'ellipse') {
      const cx = sh.x + sh.width / 2;
      const cy = sh.y + sh.height / 2;
      const rx = sh.width / 2;
      const ry = sh.height / 2;
      screenCtx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
      if (sh.filled) screenCtx.fill();
      screenCtx.stroke();
    } else if (sh.type === 'circle') {
      const cx = sh.x + sh.width / 2;
      const cy = sh.y + sh.height / 2;
      const radius = Math.min(sh.width, sh.height) / 2;
      screenCtx.arc(cx, cy, radius, 0, 2 * Math.PI);
      if (sh.filled) screenCtx.fill();
      screenCtx.stroke();
    } else if (sh.type === 'triangle') {
      // Draw triangle using custom vertices if available, otherwise default isosceles
      let x1, y1, x2, y2, x3, y3;

      if (sh.points && sh.points.length === 3) {
        // Use custom vertices
        x1 = sh.points[0].x;
        y1 = sh.points[0].y;
        x2 = sh.points[1].x;
        y2 = sh.points[1].y;
        x3 = sh.points[2].x;
        y3 = sh.points[2].y;
      } else {
        // Default isosceles triangle with apex at top-center
        x1 = sh.x + sh.width / 2; // top center (apex)
        y1 = sh.y;
        x2 = sh.x; // bottom left
        y2 = sh.y + sh.height;
        x3 = sh.x + sh.width; // bottom right
        y3 = sh.y + sh.height;
      }

      screenCtx.moveTo(x1, y1);
      screenCtx.lineTo(x2, y2);
      screenCtx.lineTo(x3, y3);
      screenCtx.closePath();

      if (sh.filled) screenCtx.fill();
      screenCtx.stroke();
    } else if (sh.type === 'parabola') {
      traceParabolaPath(screenCtx, sh);
      screenCtx.stroke();
    } else if (sh.type === 'text' && sh.text) {
      screenCtx.fillStyle = adjustedColor;
      const fontSize = sh.fontSize || 24;
      screenCtx.font = `${fontSize}px Inter, system-ui, sans-serif`;
      screenCtx.textBaseline = 'top';
      // Handle multi-line text
      const lines = sh.text.split('\n');
      const lineHeight = fontSize * 1.4;
      for (let i = 0; i < lines.length; i++) {
        screenCtx.fillText(lines[i], sh.x, sh.y + i * lineHeight);
      }
    } else if (sh.type === 'star') {
      // Draw star with custom point count
      const cx = sh.x + sh.width / 2;
      const cy = sh.y + sh.height / 2;
      const outerRadius = Math.min(sh.width, sh.height) / 2;
      const innerRadius = outerRadius * 0.38;
      const pointCount = getStarPointCount(sh);

      screenCtx.beginPath();
      for (let i = 0; i < pointCount * 2; i++) {
        const angle = (i * Math.PI) / pointCount - Math.PI / 2;
        const radius = i % 2 === 0 ? outerRadius : innerRadius;
        const x = cx + radius * Math.cos(angle);
        const y = cy + radius * Math.sin(angle);
        if (i === 0) {
          screenCtx.moveTo(x, y);
        } else {
          screenCtx.lineTo(x, y);
        }
      }
      screenCtx.closePath();

      if (sh.filled) screenCtx.fill();
      screenCtx.stroke();
    } else if (sh.type === 'arrow') {
      // Draw arrow with shaft and head
      if (sh.points && sh.points.length >= 2) {
        const start = sh.points[0];
        const end = sh.points[1];

        // Draw shaft
        screenCtx.beginPath();
        screenCtx.moveTo(start.x, start.y);
        screenCtx.lineTo(end.x, end.y);
        screenCtx.stroke();

        // Draw arrowhead
        const angle = Math.atan2(end.y - start.y, end.x - start.x);
        const headLength = 15;
        const headAngle = Math.PI / 6;

        const wing1 = {
          x: end.x - headLength * Math.cos(angle - headAngle),
          y: end.y - headLength * Math.sin(angle - headAngle),
        };
        const wing2 = {
          x: end.x - headLength * Math.cos(angle + headAngle),
          y: end.y - headLength * Math.sin(angle + headAngle),
        };

        screenCtx.beginPath();
        screenCtx.moveTo(wing1.x, wing1.y);
        screenCtx.lineTo(end.x, end.y);
        screenCtx.lineTo(wing2.x, wing2.y);
        screenCtx.stroke();
      }
    }
    // Note: images are handled separately above (before this loop skips them with continue)
    screenCtx.restore();
  }

  screenCtx.restore();
  const retainedObjectCount = retainedShapes.length + consolidatedPaths.size;
  self.postMessage({
    type: 'frame-rendered',
    requestId: lastSceneRequestId,
    viewportSequence: lastViewport.sequence,
    renderMs: performance.now() - renderStartedAt,
    retainedObjectCount,
    visibleObjectCount: visibleShapeCount + visiblePathCount,
    culledObjectCount: retainedObjectCount - visibleShapeCount - visiblePathCount,
  } satisfies Outbound);
}

function scheduleBlit() {
  const now = performance.now();
  const elapsed = now - lastBlitTime;
  if (elapsed >= BLIT_INTERVAL_MS) {
    lastBlitTime = now;
    if (blitTimer !== null) {
      clearTimeout(blitTimer as unknown as number);
      blitTimer = null;
    }
    blit();
    blitScheduled = false;
    return;
  }
  if (blitScheduled) return;
  blitScheduled = true;
  const delay = Math.max(0, BLIT_INTERVAL_MS - elapsed);
  blitTimer = setTimeout(() => {
    lastBlitTime = performance.now();
    blit();
    blitScheduled = false;
    blitTimer = null;
  }, delay) as unknown as number;
}

function handleMessage(evt: MessageEvent<Inbound>) {
  const msg = evt.data as Inbound;
  switch (msg.type) {
    case 'init': {
      const ctx = msg.canvas.getContext('2d');
      if (!ctx) {
        self.postMessage({
          type: 'init-error',
          reason: 'Unable to acquire a 2D OffscreenCanvas context.',
        } satisfies Outbound);
        return;
      }
      screenCtx = ctx;
      worldW = msg.worldWidth;
      worldH = msg.worldHeight;
      ensureWorld();
      self.postMessage({ type: 'ready' } satisfies Outbound);
      break;
    }
    case 'stroke': {
      ensureWorld();
      drawStrokeToWorld(msg.data as Stroke);
      scheduleBlit();
      break;
    }
    case 'strokes': {
      ensureWorld();
      const arr = msg.data as Stroke[];
      for (let i = 0; i < arr.length; i++) drawStrokeToWorld(arr[i]);
      scheduleBlit();
      break;
    }
    case 'shape': {
      ensureWorld();
      drawShapeToWorld(msg.data as Shape);
      scheduleBlit();
      break;
    }
    case 'load-objects': {
      ensureWorld();
      // Clear existing retained objects and consolidated paths
      retainedShapes.length = 0;
      consolidatedPaths.clear();
      // Load all shapes (including images)
      const loadMsg = msg as LoadObjectsMessage;
      for (let i = 0; i < loadMsg.data.length; i++) {
        drawShapeToWorld(loadMsg.data[i] as Shape);
      }
      scheduleBlit();
      break;
    }
    case 'load-scene': {
      ensureWorld();
      const startedAt = performance.now();
      retainedShapes.length = 0;
      consolidatedPaths.clear();
      const scene = msg as LoadSceneMessage;
      lastSceneRequestId = scene.requestId;
      for (let i = 0; i < scene.strokes.length; i++) drawStrokeToWorld(scene.strokes[i]);
      for (let i = 0; i < scene.shapes.length; i++) drawShapeToWorld(scene.shapes[i]);
      self.postMessage({
        type: 'scene-applied',
        requestId: scene.requestId,
        objectCount: scene.shapes.length + scene.strokes.length,
        ingestionMs: performance.now() - startedAt,
      } satisfies Outbound);
      scheduleBlit();
      break;
    }
    case 'viewport': {
      lastViewport = msg as ViewportMessage;
      scheduleBlit();
      break;
    }
    case 'clear': {
      ensureWorld();
      if (worldCtx) {
        worldCtx.fillStyle = canvasBgColor;
        worldCtx.fillRect(0, 0, worldW, worldH);
      }
      // Also clear retained vectors and consolidated paths
      retainedShapes.length = 0;
      consolidatedPaths.clear();
      scheduleBlit();
      break;
    }
    case 'clear-region': {
      ensureWorld();
      const m = msg as ClearRegionMessage;
      if (worldCtx) {
        worldCtx.save();
        worldCtx.fillStyle = canvasBgColor;
        worldCtx.fillRect(m.x, m.y, m.width, m.height);
        worldCtx.restore();
      }
      // Remove any retained items whose bbox intersects the cleared region
      const rx1 = m.x,
        ry1 = m.y,
        rx2 = m.x + m.width,
        ry2 = m.y + m.height;
      function lineBBox(x0: number, y0: number, x1: number, y1: number) {
        const minX = Math.min(x0, x1);
        const minY = Math.min(y0, y1);
        const maxX = Math.max(x0, x1);
        const maxY = Math.max(y0, y1);
        return { minX, minY, maxX, maxY };
      }
      function intersects(ax1: number, ay1: number, ax2: number, ay2: number) {
        return !(ax2 < rx1 || ax1 > rx2 || ay2 < ry1 || ay1 > ry2);
      }
      // Remove consolidated paths that intersect the cleared region
      const groupsToRemove: string[] = [];
      for (const [groupId, path] of consolidatedPaths) {
        if (intersects(path.bounds.minX, path.bounds.minY, path.bounds.maxX, path.bounds.maxY)) {
          groupsToRemove.push(groupId);
        }
      }
      for (const gid of groupsToRemove) {
        consolidatedPaths.delete(gid);
      }
      for (let i = retainedShapes.length - 1; i >= 0; i--) {
        const sh = retainedShapes[i];
        // Skip images - they are not erasable
        if (sh.type === 'image') {
          continue;
        }
        let minX = 0,
          minY = 0,
          maxX = 0,
          maxY = 0;
        if (sh.type === 'stroke' && sh.points && sh.points.length > 0) {
          minX = Math.min(...sh.points.map((point) => point.x)) - sh.size;
          minY = Math.min(...sh.points.map((point) => point.y)) - sh.size;
          maxX = Math.max(...sh.points.map((point) => point.x)) + sh.size;
          maxY = Math.max(...sh.points.map((point) => point.y)) + sh.size;
        } else if (sh.type === 'line') {
          const bb = lineBBox(sh.x, sh.y, sh.x + sh.width, sh.y + sh.height);
          minX = bb.minX;
          minY = bb.minY;
          maxX = bb.maxX;
          maxY = bb.maxY;
        } else {
          const rx = sh.x + sh.width;
          const ry = sh.y + sh.height;
          minX = Math.min(sh.x, rx);
          minY = Math.min(sh.y, ry);
          maxX = Math.max(sh.x, rx);
          maxY = Math.max(sh.y, ry);
        }
        if (intersects(minX, minY, maxX, maxY)) {
          retainedShapes.splice(i, 1);
        }
      }
      scheduleBlit();
      break;
    }
    case 'clear-shape': {
      ensureWorld();
      if (!worldCtx) break;
      const sh = (msg as ClearShapeMessage).data;
      const bg = canvasBgColor;
      worldCtx.save();
      if (sh.type === 'rectangle') {
        if (sh.filled) {
          worldCtx.beginPath();
          worldCtx.rect(sh.x, sh.y, sh.width, sh.height);
          worldCtx.clip();
          worldCtx.fillStyle = bg;
          worldCtx.fillRect(sh.x, sh.y, sh.width, sh.height);
        } else {
          worldCtx.strokeStyle = bg;
          worldCtx.lineWidth = sh.size;
          worldCtx.lineCap = 'square';
          worldCtx.lineJoin = 'miter';
          worldCtx.strokeRect(sh.x, sh.y, sh.width, sh.height);
        }
      } else if (sh.type === 'ellipse') {
        const cx = sh.x + sh.width / 2;
        const cy = sh.y + sh.height / 2;
        const rx = sh.width / 2;
        const ry = sh.height / 2;
        worldCtx.beginPath();
        worldCtx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
        if (sh.filled) {
          worldCtx.clip();
          worldCtx.fillStyle = bg;
          worldCtx.fillRect(sh.x, sh.y, sh.width, sh.height);
        } else {
          worldCtx.strokeStyle = bg;
          worldCtx.lineWidth = sh.size;
          worldCtx.lineCap = 'round';
          worldCtx.lineJoin = 'round';
          worldCtx.stroke();
        }
      } else if (sh.type === 'line') {
        worldCtx.strokeStyle = bg;
        worldCtx.lineWidth = sh.size;
        worldCtx.lineCap = 'round';
        worldCtx.lineJoin = 'round';
        worldCtx.beginPath();
        worldCtx.moveTo(sh.x, sh.y);
        worldCtx.lineTo(sh.x + sh.width, sh.y + sh.height);
        worldCtx.stroke();
      } else if (sh.type === 'parabola') {
        worldCtx.strokeStyle = bg;
        worldCtx.lineWidth = sh.size;
        worldCtx.lineCap = 'round';
        worldCtx.lineJoin = 'round';
        worldCtx.beginPath();
        traceParabolaPath(worldCtx, sh);
        worldCtx.stroke();
      }
      worldCtx.restore();
      // Do NOT remove other retained items; we only clear raster pixels. Vector items will redraw on top.
      scheduleBlit();
      break;
    }
    case 'remove-group': {
      const m = msg as RemoveGroupMessage;
      // Remove from consolidated paths
      consolidatedPaths.delete(m.groupId);
      scheduleBlit();
      break;
    }
    case 'snapshot-image': {
      const m = msg as SnapshotImageMessage;
      if (typeof m.worldWidth === 'number' && typeof m.worldHeight === 'number') {
        worldW = m.worldWidth;
        worldH = m.worldHeight;
      }
      ensureWorld();
      if (!worldCtx) break;
      fetch(m.dataUrl)
        .then((r) => r.blob())
        .then(async (blob) => {
          const bmp = await createImageBitmap(blob);
          if (!worldCtx) return;
          worldCtx.save();
          worldCtx.setTransform(1, 0, 0, 1, 0, 0);
          worldCtx.fillStyle = canvasBgColor;
          worldCtx.fillRect(0, 0, worldW, worldH);
          worldCtx.drawImage(bmp, 0, 0, worldW, worldH);
          worldCtx.restore();
          // Do NOT clear retained vectors; keep vector state for crisp rendering
          scheduleBlit();
        })
        .catch(() => {});
      break;
    }
    case 'theme': {
      const m = msg as ThemeMessage;
      canvasBgColor = m.bgColor;
      // Detect if we're in light mode based on background color luminance
      const bgRgb = hexToRgb(m.bgColor);
      isLightMode = bgRgb ? getLuminance(bgRgb.r, bgRgb.g, bgRgb.b) > 0.5 : false;
      // Re-clear world canvas with new background
      if (worldCtx) {
        worldCtx.fillStyle = canvasBgColor;
        worldCtx.fillRect(0, 0, worldW, worldH);
      }
      scheduleBlit();
      break;
    }
    case 'snapshot': {
      // Compose snapshot using raster world (if any) plus retained vectors at 1x in world space
      const snap = new OffscreenCanvas(worldW, worldH);
      const ctx = snap.getContext('2d');
      if (!ctx) break;
      // Background
      ctx.fillStyle = canvasBgColor;
      ctx.fillRect(0, 0, worldW, worldH);
      if (world) {
        ctx.drawImage(world, 0, 0);
      }
      // Draw vectors in world space
      // Images first (in background)
      for (let i = 0; i < retainedShapes.length; i++) {
        const sh = retainedShapes[i] as unknown as {
          type: string;
          imageData?: string;
          x?: number;
          y?: number;
          width?: number;
          height?: number;
          alpha?: number;
          properties?: Record<string, unknown>;
        };
        if (
          sh.type === 'image' &&
          sh.imageData &&
          !sh.properties?.hidden &&
          sh.x !== undefined &&
          sh.y !== undefined &&
          sh.width !== undefined &&
          sh.height !== undefined
        ) {
          const bitmap = imageBitmapCache.get(sh.imageData);
          if (bitmap) {
            ctx.save();
            ctx.globalAlpha = sh.alpha ?? 1;
            applyObjectRotation(ctx, {
              x: sh.x,
              y: sh.y,
              width: sh.width,
              height: sh.height,
              properties: sh.properties,
            });
            ctx.drawImage(bitmap, sh.x, sh.y, sh.width, sh.height);
            ctx.restore();
          }
        }
      }
      // Draw consolidated paths first (batched strokes)
      for (const [, path] of consolidatedPaths) {
        const isEraserPath = isBackgroundColor(path.color);

        ctx.save();
        if (isEraserPath) {
          ctx.globalCompositeOperation = 'destination-out';
          ctx.strokeStyle = '#000000';
        } else {
          ctx.strokeStyle = path.color;
        }
        ctx.lineWidth = path.size;
        ctx.globalAlpha = path.alpha;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (path.points.length > 0) {
          ctx.beginPath();
          ctx.moveTo(path.points[0].x, path.points[0].y);
          for (let i = 1; i < path.points.length; i++) {
            ctx.lineTo(path.points[i].x, path.points[i].y);
          }
          ctx.stroke();
        }
        ctx.restore();
      }
      // Shapes (skip images - already rendered above)
      for (let i = 0; i < retainedShapes.length; i++) {
        const sh = retainedShapes[i];
        if (sh.properties?.hidden) continue;
        if (sh.type === 'image') continue;
        ctx.save();
        ctx.strokeStyle = sh.color;
        ctx.lineWidth = sh.size; // in world space
        ctx.globalAlpha = sh.alpha ?? 1;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.fillStyle = sh.color;
        applyObjectRotation(ctx, sh);
        ctx.beginPath();
        if (sh.type === 'stroke' && sh.points && sh.points.length > 1) {
          for (let pointIndex = 1; pointIndex < sh.points.length; pointIndex++) {
            const previous = sh.points[pointIndex - 1];
            const point = sh.points[pointIndex];
            ctx.beginPath();
            ctx.moveTo(previous.x, previous.y);
            ctx.lineTo(point.x, point.y);
            ctx.lineWidth = point.width ?? sh.size;
            ctx.stroke();
          }
        } else if (sh.type === 'line') {
          ctx.moveTo(sh.x, sh.y);
          ctx.lineTo(sh.x + sh.width, sh.y + sh.height);
          ctx.stroke();
        } else if (sh.type === 'rectangle') {
          ctx.rect(sh.x, sh.y, sh.width, sh.height);
          if (sh.filled) ctx.fill();
          ctx.stroke();
        } else if (sh.type === 'ellipse') {
          const cx = sh.x + sh.width / 2;
          const cy = sh.y + sh.height / 2;
          const rx = sh.width / 2;
          const ry = sh.height / 2;
          ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
          if (sh.filled) ctx.fill();
          ctx.stroke();
        } else if (sh.type === 'text' && sh.text) {
          ctx.fillStyle = sh.color;
          const fontSize = sh.fontSize || 24;
          ctx.font = `${fontSize}px Inter, system-ui, sans-serif`;
          ctx.textBaseline = 'top';
          const lines = sh.text.split('\n');
          const lineHeight = fontSize * 1.4;
          for (let i = 0; i < lines.length; i++) {
            ctx.fillText(lines[i], sh.x, sh.y + i * lineHeight);
          }
        }
        ctx.restore();
      }
      snap
        .convertToBlob({ type: 'image/png' })
        .then((blob) => {
          if (!blob) return;
          const reader = new FileReader();
          reader.onload = () => {
            self.postMessage({ type: 'snapshot', dataUrl: String(reader.result) } as Outbound);
          };
          reader.readAsDataURL(blob);
        })
        .catch(() => {});
      break;
    }
  }
}

self.onmessage = handleMessage as unknown as (ev: MessageEvent) => void;
