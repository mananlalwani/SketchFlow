import type { Inbound, Outbound } from './rendererWorkerTypes';
import type { RendererRuntime } from './rendererWorkerRuntime';

export function handleRendererMessage(evt: MessageEvent<Inbound>, rt: RendererRuntime) {

  const msg = evt.data;
  switch (msg.type) {
    case 'init': {
      const ctx = msg.canvas.getContext('2d');
      if (!ctx) {
        rt.postMessage({
          type: 'init-error',
          reason: 'Unable to acquire a 2D OffscreenCanvas context.',
        } satisfies Outbound);
        return;
      }
      rt.screenCtx = ctx;
      rt.worldW = msg.worldWidth;
      rt.worldH = msg.worldHeight;
      rt.ensureWorld();
      rt.postMessage({ type: 'ready' } satisfies Outbound);
      break;
    }
    case 'stroke': {
      rt.ensureWorld();
      rt.drawStrokeToWorld(msg.data);
      rt.scheduleBlit();
      break;
    }
    case 'strokes': {
      rt.ensureWorld();
      const arr = msg.data;
      for (let i = 0; i < arr.length; i++) rt.drawStrokeToWorld(arr[i]);
      rt.scheduleBlit();
      break;
    }
    case 'shape': {
      rt.ensureWorld();
      rt.drawDrawingToWorld(msg.data);
      rt.scheduleBlit();
      break;
    }
    case 'load-objects': {
      rt.ensureWorld();
      // Clear existing retained objects and consolidated paths
      rt.retainedDrawings.length = 0;
      rt.consolidatedPaths.clear();
      // Load all shapes (including images)
      for (let i = 0; i < msg.data.length; i++) {
        rt.drawDrawingToWorld(msg.data[i]);
      }
      rt.scheduleBlit();
      break;
    }
    case 'load-scene': {
      rt.ensureWorld();
      const startedAt = performance.now();
      rt.retainedDrawings.length = 0;
      rt.consolidatedPaths.clear();
      rt.lastSceneRequestId = msg.requestId;
      for (let i = 0; i < msg.strokes.length; i++) rt.drawStrokeToWorld(msg.strokes[i]);
      for (let i = 0; i < msg.drawings.length; i++) rt.drawDrawingToWorld(msg.drawings[i]);
      rt.postMessage({
        type: 'scene-applied',
        requestId: msg.requestId,
        objectCount: msg.drawings.length + msg.strokes.length,
        ingestionMs: performance.now() - startedAt,
      } satisfies Outbound);
      rt.scheduleBlit();
      break;
    }
    case 'viewport': {
      rt.lastViewport = msg;
      rt.scheduleBlit();
      break;
    }
    case 'clear': {
      rt.ensureWorld();
      if (rt.worldCtx) {
        rt.worldCtx.fillStyle = rt.canvasBgColor;
        rt.worldCtx.fillRect(0, 0, rt.worldW, rt.worldH);
      }
      // Also clear retained vectors and consolidated paths
      rt.retainedDrawings.length = 0;
      rt.consolidatedPaths.clear();
      rt.scheduleBlit();
      break;
    }
    case 'clear-region': {
      rt.ensureWorld();
      const m = msg;
      if (rt.worldCtx) {
        rt.worldCtx.save();
        rt.worldCtx.fillStyle = rt.canvasBgColor;
        rt.worldCtx.fillRect(m.x, m.y, m.width, m.height);
        rt.worldCtx.restore();
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
      for (const [groupId, path] of rt.consolidatedPaths) {
        if (intersects(path.bounds.minX, path.bounds.minY, path.bounds.maxX, path.bounds.maxY)) {
          groupsToRemove.push(groupId);
        }
      }
      for (const gid of groupsToRemove) {
        rt.consolidatedPaths.delete(gid);
      }
      for (let i = rt.retainedDrawings.length - 1; i >= 0; i--) {
        const sh = rt.retainedDrawings[i];
        // Skip images - they are not erasable

        let minX = 0,
          minY = 0,
          maxX = 0,
          maxY = 0;
        if (sh.type === 'stroke' && sh.points && sh.points.length > 0) {
          const margin = rt.getMaxStrokeWidth(sh.points, sh.size);
          minX = Math.min(...sh.points.map((point) => point.x)) - margin;
          minY = Math.min(...sh.points.map((point) => point.y)) - margin;
          maxX = Math.max(...sh.points.map((point) => point.x)) + margin;
          maxY = Math.max(...sh.points.map((point) => point.y)) + margin;
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
          rt.retainedDrawings.splice(i, 1);
        }
      }
      rt.scheduleBlit();
      break;
    }
    case 'clear-shape': {
      rt.ensureWorld();
      if (!rt.worldCtx) break;
      const sh = msg.data;
      const bg = rt.canvasBgColor;
      rt.worldCtx.save();
      if (sh.type === 'rectangle') {
        if (sh.filled) {
          rt.worldCtx.beginPath();
          rt.worldCtx.rect(sh.x, sh.y, sh.width, sh.height);
          rt.worldCtx.clip();
          rt.worldCtx.fillStyle = bg;
          rt.worldCtx.fillRect(sh.x, sh.y, sh.width, sh.height);
        } else {
          rt.worldCtx.strokeStyle = bg;
          rt.worldCtx.lineWidth = sh.size;
          rt.worldCtx.lineCap = 'square';
          rt.worldCtx.lineJoin = 'miter';
          rt.worldCtx.strokeRect(sh.x, sh.y, sh.width, sh.height);
        }
      } else if (sh.type === 'ellipse') {
        const cx = sh.x + sh.width / 2;
        const cy = sh.y + sh.height / 2;
        const rx = sh.width / 2;
        const ry = sh.height / 2;
        rt.worldCtx.beginPath();
        rt.worldCtx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
        if (sh.filled) {
          rt.worldCtx.clip();
          rt.worldCtx.fillStyle = bg;
          rt.worldCtx.fillRect(sh.x, sh.y, sh.width, sh.height);
        } else {
          rt.worldCtx.strokeStyle = bg;
          rt.worldCtx.lineWidth = sh.size;
          rt.worldCtx.lineCap = 'round';
          rt.worldCtx.lineJoin = 'round';
          rt.worldCtx.stroke();
        }
      } else if (sh.type === 'line') {
        rt.worldCtx.strokeStyle = bg;
        rt.worldCtx.lineWidth = sh.size;
        rt.worldCtx.lineCap = 'round';
        rt.worldCtx.lineJoin = 'round';
        rt.worldCtx.beginPath();
        rt.worldCtx.moveTo(sh.x, sh.y);
        rt.worldCtx.lineTo(sh.x + sh.width, sh.y + sh.height);
        rt.worldCtx.stroke();
      } else if (sh.type === 'parabola') {
        rt.worldCtx.strokeStyle = bg;
        rt.worldCtx.lineWidth = sh.size;
        rt.worldCtx.lineCap = 'round';
        rt.worldCtx.lineJoin = 'round';
        rt.worldCtx.beginPath();
        rt.traceParabolaPath(rt.worldCtx, sh);
        rt.worldCtx.stroke();
      }
      rt.worldCtx.restore();
      // Do NOT remove other retained items; we only clear raster pixels. Vector items will redraw on top.
      rt.scheduleBlit();
      break;
    }
    case 'remove-group': {
      const m = msg;
      // Remove from consolidated paths
      rt.consolidatedPaths.delete(m.groupId);
      rt.scheduleBlit();
      break;
    }
    case 'snapshot-image': {
      const m = msg;
      if (m.worldWidth !== undefined && m.worldHeight !== undefined) {
        rt.worldW = m.worldWidth;
        rt.worldH = m.worldHeight;
      }
      rt.ensureWorld();
      if (!rt.worldCtx) break;
      fetch(m.dataUrl)
        .then((r) => r.blob())
        .then(async (blob) => {
          const bmp = await createImageBitmap(blob);
          if (!rt.worldCtx) return;
          rt.worldCtx.save();
          rt.worldCtx.setTransform(1, 0, 0, 1, 0, 0);
          rt.worldCtx.fillStyle = rt.canvasBgColor;
          rt.worldCtx.fillRect(0, 0, rt.worldW, rt.worldH);
          rt.worldCtx.drawImage(bmp, 0, 0, rt.worldW, rt.worldH);
          rt.worldCtx.restore();
          // Do NOT clear retained vectors; keep vector state for crisp rendering
          rt.scheduleBlit();
        })
        .catch(() => {});
      break;
    }
    case 'theme': {
      const m = msg;
      rt.canvasBgColor = m.bgColor;
      // Detect if we're in light mode based on background color luminance
      const bgRgb = rt.hexToRgb(m.bgColor);
      rt.isLightMode = bgRgb ? rt.getLuminance(bgRgb.r, bgRgb.g, bgRgb.b) > 0.5 : false;
      // Re-clear rt.world canvas with new background
      if (rt.worldCtx) {
        rt.worldCtx.fillStyle = rt.canvasBgColor;
        rt.worldCtx.fillRect(0, 0, rt.worldW, rt.worldH);
      }
      rt.scheduleBlit();
      break;
    }
    case 'snapshot': {
      // Compose snapshot using raster rt.world (if any) plus retained vectors at 1x in rt.world space
      const snap = new OffscreenCanvas(rt.worldW, rt.worldH);
      const ctx = snap.getContext('2d');
      if (!ctx) break;
      // Background
      ctx.fillStyle = rt.canvasBgColor;
      ctx.fillRect(0, 0, rt.worldW, rt.worldH);
      if (rt.world) {
        ctx.drawImage(rt.world, 0, 0);
      }
      // Draw vectors in rt.world space
      // Images first (in background)
      for (let i = 0; i < rt.retainedDrawings.length; i++) {
        const sh = rt.retainedDrawings[i];
        if (
          sh.type === 'image' &&
          sh.imageData &&
          !sh.properties?.hidden &&
          sh.x !== undefined &&
          sh.y !== undefined &&
          sh.width !== undefined &&
          sh.height !== undefined
        ) {
          const bitmap = rt.imageBitmapCache.get(sh.imageData);
          if (bitmap) {
            ctx.save();
            ctx.globalAlpha = sh.alpha ?? 1;
            rt.applyObjectRotation(ctx, {
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
      for (const [, path] of rt.consolidatedPaths) {
        const isEraserPath = rt.isBackgroundColor(path.color);

        ctx.save();
        if (isEraserPath) {
          ctx.globalCompositeOperation = 'destination-out';
        }
        rt.drawWorkerStrokePath(ctx, path, isEraserPath ? '#000000' : path.color);
        ctx.restore();
      }
      // Shapes (skip images - already rendered above)
      for (let i = 0; i < rt.retainedDrawings.length; i++) {
        const sh = rt.retainedDrawings[i];
        if (sh.properties?.hidden) continue;
        if (sh.type === 'image') continue;
        rt.drawWorkerRendererObject(ctx, sh, sh.color);
      }
      snap
        .convertToBlob({ type: 'image/png' })
        .then((blob) => {
          if (!blob) return;
          const reader = new FileReader();
          reader.onload = () => {
            rt.postMessage({
              type: 'snapshot',
              dataUrl: String(reader.result),
            } satisfies Outbound);
          };
          reader.readAsDataURL(blob);
        })
        .catch(() => {});
      break;
    }
}
}
