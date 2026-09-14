import { objectIntersectsViewport } from '../lib/viewportCulling';
import { drawWorkerRendererObject, drawWorkerStrokePath } from '../lib/canvasRendererWorkerAdapter';
import { isBackgroundColor } from '../lib/rendererWorkerTheme';
import type { Outbound } from './rendererWorkerTypes';
import type { RendererRuntime } from './rendererWorkerRuntime';

const SSAA_FACTOR = 1;
const MAX_SSAA_PIXELS = 8000000;
const MAX_OFFSCREEN_DIM = 8192;
const BLIT_INTERVAL_MS = 1000 / 60;

export function createWorkerBlit(rt: RendererRuntime) {
  let lastBlitTime = 0;
  let blitScheduled = false;
  let blitTimer: ReturnType<typeof setTimeout> | null = null;
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
    const proximity = 1 - Math.min(frac, 1 - frac);
    const SNAP_THRESHOLD = 0.85;
    if (nearest >= 1 && proximity >= SNAP_THRESHOLD) {
      const worldWidth = nearest / (zoom * dpr);
      const offset = (nearest & 1) === 1 ? 0.5 / (dpr * zoom) : 0;
      return { worldWidth, offset, snapped: true } as const;
    }
    return { worldWidth: lineWidthWorld, offset: 0, snapped: false } as const;
  }

function blit() {
  if (!rt.screenCtx) return;
  const renderStartedAt = performance.now();

  const { zoom, viewX, viewY, canvasWidth, canvasHeight, dpr } = rt.lastViewport;

  const safeDpr = dpr || 1;
  const targetW = Math.max(1, Math.floor(canvasWidth * safeDpr));
  const targetH = Math.max(1, Math.floor(canvasHeight * safeDpr));
  if (rt.screenCtx.canvas.width !== targetW || rt.screenCtx.canvas.height !== targetH) {
    rt.screenCtx.canvas.width = targetW;
    rt.screenCtx.canvas.height = targetH;
  }

  // Clear in device pixel space
  rt.screenCtx.save();
  rt.screenCtx.setTransform(1, 0, 0, 1, 0, 0);
  rt.screenCtx.fillStyle = rt.canvasBgColor;
  rt.screenCtx.fillRect(0, 0, targetW, targetH);

  // Determine dynamic SSAA factor with safety caps - keep it low for performance
  const vectorCount = rt.consolidatedPaths.size + rt.retainedDrawings.length;
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

  // Draw raster rt.world in screen space with adaptive smoothing unless we choose to skip
  const shouldSkipRaster = vectorCount > 0 && zoom >= 1.15;
  if (rt.world && !shouldSkipRaster) {
    const anyCtx = rt.screenCtx;
    const scale = zoom * safeDpr;
    const frac = Math.abs(scale - Math.round(scale));
    const shouldSmooth = frac > 0.05 || scale < 1;
    anyCtx.imageSmoothingEnabled = shouldSmooth;
    anyCtx.imageSmoothingQuality = 'high';

    const srcX = viewX;
    const srcY = viewY;
    const srcW = canvasWidth / Math.max(zoom, 0.0001);
    const srcH = canvasHeight / Math.max(zoom, 0.0001);

    rt.screenCtx.drawImage(rt.world, srcX, srcY, srcW, srcH, 0, 0, targetW, targetH);

    anyCtx.imageSmoothingEnabled = false;
  }
  rt.screenCtx.restore();

  // Compute current rt.world viewport for culling
  const vx1 = viewX;
  const vy1 = viewY;
  const vx2 = viewX + canvasWidth / Math.max(zoom, 0.0001);
  const vy2 = viewY + canvasHeight / Math.max(zoom, 0.0001);
  const visibleDrawingCount = rt.retainedDrawings.filter((drawing) =>
    objectIntersectsViewport(drawing, vx1, vy1, vx2, vy2),
  ).length;
  const visiblePathCount = Array.from(rt.consolidatedPaths.values()).filter((path) => {
    const margin = Math.max(2, path.maxWidth);
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
    for (let i = 0; i < rt.retainedDrawings.length; i++) {
      const sh = rt.retainedDrawings[i];
      if (sh.type === 'image' && sh.imageData && !sh.properties?.hidden) {
        // Check viewport intersection for images (they can be large)
        if (objectIntersectsViewport(sh, vx1, vy1, vx2, vy2)) {
          const bitmap = rt.imageBitmapCache.get(sh.imageData);
          if (bitmap) {
            vectorSSCtx.save();
            vectorSSCtx.globalAlpha = sh.alpha ?? 1;
            rt.applyObjectRotation(vectorSSCtx, sh);
            vectorSSCtx.drawImage(bitmap, sh.x, sh.y, sh.width, sh.height);
            vectorSSCtx.restore();
          } else {
            // Image not loaded yet, try to load it
            rt.loadImageBitmap(sh.imageData).then(() => {
              scheduleBlit(); // Re-render once loaded
            });
          }
        }
      }
    }

    // Draw consolidated paths first (batched strokes for performance)
    for (const [, path] of rt.consolidatedPaths) {
      // Viewport culling using bounds
      const margin = Math.max(2, path.maxWidth);
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
      }
      drawWorkerStrokePath(
        vectorSSCtx,
        path,
        isEraserPath ? '#000000' : rt.adjustColorForTheme(path.color),
      );
      vectorSSCtx.restore();
    }

    for (let i = 0; i < rt.retainedDrawings.length; i++) {
      const sh = rt.retainedDrawings[i];
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
      const adjustedShColor = rt.adjustColorForTheme(sh.color);
      drawWorkerRendererObject(vectorSSCtx, sh, adjustedShColor);
    }

    vectorSSCtx.restore();

    // Composite SS buffer to screen at device resolution
    const anyCtx = rt.screenCtx;
    anyCtx.imageSmoothingEnabled = true;
    anyCtx.imageSmoothingQuality = 'high';
    rt.screenCtx.save();
    rt.screenCtx.setTransform(1, 0, 0, 1, 0, 0);
    rt.screenCtx.drawImage(vectorSS, 0, 0, vectorSS.width, vectorSS.height, 0, 0, targetW, targetH);
    rt.screenCtx.restore();
    anyCtx.imageSmoothingEnabled = false;
    const retainedObjectCount = rt.retainedDrawings.length + rt.consolidatedPaths.size;
    rt.postMessage({
      type: 'frame-rendered',
      requestId: rt.lastSceneRequestId,
      viewportSequence: rt.lastViewport.sequence,
      renderMs: performance.now() - renderStartedAt,
      retainedObjectCount,
      visibleObjectCount: visibleDrawingCount + visiblePathCount,
      culledObjectCount: retainedObjectCount - visibleDrawingCount - visiblePathCount,
    } satisfies Outbound);
    return;
  }

  // Fallback: draw vectors directly (if SSAA disabled or allocation failed), with culling
  rt.screenCtx.save();
  rt.screenCtx.scale(safeDpr, safeDpr);
  const rawTx = -viewX * zoom;
  const rawTy = -viewY * zoom;
  const snappedTx = Math.round(rawTx * safeDpr) / safeDpr;
  const snappedTy = Math.round(rawTy * safeDpr) / safeDpr;
  rt.screenCtx.translate(snappedTx, snappedTy);
  rt.screenCtx.scale(zoom, zoom);

  // Draw images first (in background)
  for (let i = 0; i < rt.retainedDrawings.length; i++) {
    const sh = rt.retainedDrawings[i];
    if (
      sh.type === 'image' &&
      sh.imageData &&
      !sh.properties?.hidden &&
      objectIntersectsViewport(sh, vx1, vy1, vx2, vy2)
    ) {
      const bitmap = rt.imageBitmapCache.get(sh.imageData);
      if (bitmap) {
        rt.screenCtx.save();
        rt.screenCtx.globalAlpha = sh.alpha ?? 1;
        rt.applyObjectRotation(rt.screenCtx, sh);
        rt.screenCtx.drawImage(bitmap, sh.x, sh.y, sh.width, sh.height);
        rt.screenCtx.restore();
      } else {
        // Image not loaded yet, try to load it
        rt.loadImageBitmap(sh.imageData).then(() => {
          scheduleBlit(); // Re-render once loaded
        });
      }
    }
  }

  // Draw consolidated paths first (batched strokes for performance)
  for (const [, path] of rt.consolidatedPaths) {
    // Viewport culling using bounds
    const margin = Math.max(2, path.maxWidth);
    if (
      path.bounds.maxX + margin < vx1 ||
      path.bounds.minX - margin > vx2 ||
      path.bounds.maxY + margin < vy1 ||
      path.bounds.minY - margin > vy2
    )
      continue;

    const isEraserPath = isBackgroundColor(path.color);

    rt.screenCtx.save();
    if (isEraserPath) {
      rt.screenCtx.globalCompositeOperation = 'destination-out';
      rt.screenCtx.strokeStyle = '#000000';
    } else {
      rt.screenCtx.strokeStyle = rt.adjustColorForTheme(path.color);
    }
    const snap = getSnappedWorldLineWidth(path.size, zoom, safeDpr);
    if (snap.snapped && snap.offset !== 0) {
      rt.screenCtx.translate(snap.offset, snap.offset);
    }

    drawWorkerStrokePath(
      rt.screenCtx,
      path,
      isEraserPath ? '#000000' : rt.adjustColorForTheme(path.color),
    );
    rt.screenCtx.restore();
  }

  for (let i = 0; i < rt.retainedDrawings.length; i++) {
    const sh = rt.retainedDrawings[i];
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
    const adjustedColor = rt.adjustColorForTheme(sh.color);
    const snappedSize = getSnappedWorldLineWidth(sh.size, zoom, safeDpr).worldWidth;
    drawWorkerRendererObject(rt.screenCtx, sh, adjustedColor, snappedSize);
  }

  rt.screenCtx.restore();
  const retainedObjectCount = rt.retainedDrawings.length + rt.consolidatedPaths.size;
  rt.postMessage({
    type: 'frame-rendered',
    requestId: rt.lastSceneRequestId,
    viewportSequence: rt.lastViewport.sequence,
    renderMs: performance.now() - renderStartedAt,
    retainedObjectCount,
    visibleObjectCount: visibleDrawingCount + visiblePathCount,
    culledObjectCount: retainedObjectCount - visibleDrawingCount - visiblePathCount,
  } satisfies Outbound);
}

function scheduleBlit() {
  const now = performance.now();
  const elapsed = now - lastBlitTime;
  if (elapsed >= BLIT_INTERVAL_MS) {
    lastBlitTime = now;
    if (blitTimer !== null) {
      clearTimeout(blitTimer);
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
  }, delay);
}

  return { blit, scheduleBlit };
}
