import type { DrawingObject } from '@/store/drawingStore';
import { drawVariableWidthStroke } from './canvasRendererCommands';
import { triangleVertices } from './exportGeometry';

export function renderObjectsToContext(
  ctx: CanvasRenderingContext2D,
  objects: DrawingObject[],
): void {
  for (const obj of objects) {
    ctx.save();
    ctx.globalAlpha = obj.alpha ?? 1;
    ctx.strokeStyle = obj.color;
    ctx.fillStyle = obj.color;
    ctx.lineWidth = obj.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (obj.rotation && obj.x !== undefined && obj.y !== undefined) {
      const centerX = obj.x + (obj.width ?? 0) / 2;
      const centerY = obj.y + (obj.height ?? 0) / 2;
      ctx.translate(centerX, centerY);
      ctx.rotate((obj.rotation * Math.PI) / 180);
      ctx.translate(-centerX, -centerY);
    }

    switch (obj.type) {
      case 'stroke':
        drawVariableWidthStroke(ctx, obj.points, obj.size);
        break;

      case 'line':
        if (obj.x !== undefined && obj.y !== undefined) {
          ctx.beginPath();
          ctx.moveTo(obj.x, obj.y);
          ctx.lineTo(obj.x + (obj.width || 0), obj.y + (obj.height || 0));
          ctx.stroke();
        }
        break;

      case 'rectangle':
        if (obj.x !== undefined && obj.y !== undefined) {
          if (obj.filled) {
            ctx.fillRect(obj.x, obj.y, obj.width || 0, obj.height || 0);
          } else {
            ctx.strokeRect(obj.x, obj.y, obj.width || 0, obj.height || 0);
          }
        }
        break;

      case 'ellipse':
      case 'circle':
        if (obj.x !== undefined && obj.y !== undefined && obj.width && obj.height) {
          const cx = obj.x + obj.width / 2;
          const cy = obj.y + obj.height / 2;
          const rx = Math.abs(obj.width / 2);
          const ry = Math.abs(obj.height / 2);

          ctx.beginPath();
          ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
          if (obj.filled) {
            ctx.fill();
          } else {
            ctx.stroke();
          }
        }
        break;

      case 'triangle':
        {
          const vertices = triangleVertices(obj);
          if (!vertices) break;

          ctx.beginPath();
          ctx.moveTo(vertices[0].x, vertices[0].y);
          ctx.lineTo(vertices[1].x, vertices[1].y);
          ctx.lineTo(vertices[2].x, vertices[2].y);
          ctx.closePath();

          if (obj.filled) {
            ctx.fill();
          } else {
            ctx.stroke();
          }
        }
        break;

      case 'text':
        if (obj.x !== undefined && obj.y !== undefined && obj.text) {
          const fontSize = obj.fontSize || 24;
          ctx.font = `${fontSize}px sans-serif`;
          const lineHeight = fontSize * 1.2;
          const lines = obj.text.split('\n');
          lines.forEach((line, i) => {
            ctx.fillText(line, obj.x!, obj.y! + fontSize + i * lineHeight);
          });
        }
        break;

      case 'image':
        // Images need async loading - skip for now in sync render
        break;

      case 'arrow':
        renderArrowToContext(ctx, obj);
        break;

      case 'star':
        renderStarToContext(ctx, obj);
        break;
    }

    ctx.restore();
  }
}

function renderArrowToContext(ctx: CanvasRenderingContext2D, obj: DrawingObject): void {
  if (!obj.points || obj.points.length < 2) return;

  const points = obj.points;

  // Draw the main shaft
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  ctx.lineTo(points[1].x, points[1].y);
  ctx.stroke();

  // Draw the arrowhead
  if (points.length >= 5) {
    const tip = points[2];
    const wing1 = points[3];
    const wing2 = points[4];

    ctx.beginPath();
    ctx.moveTo(wing1.x, wing1.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.lineTo(wing2.x, wing2.y);
    ctx.stroke();
  } else {
    // Generate arrowhead based on direction
    const start = points[0];
    const end = points[1];
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

    ctx.beginPath();
    ctx.moveTo(wing1.x, wing1.y);
    ctx.lineTo(end.x, end.y);
    ctx.lineTo(wing2.x, wing2.y);
    ctx.stroke();
  }
}

function renderStarToContext(ctx: CanvasRenderingContext2D, obj: DrawingObject): void {
  if (obj.x === undefined || obj.y === undefined || !obj.width || !obj.height) return;

  const cx = obj.x + obj.width / 2;
  const cy = obj.y + obj.height / 2;
  const outerRadius = Math.min(obj.width, obj.height) / 2;
  const innerRadius = outerRadius * 0.38;
  const pointCount = obj.properties?.pointCount || 5;

  // Generate star vertices
  const vertices: { x: number; y: number }[] = [];
  for (let i = 0; i < pointCount * 2; i++) {
    const angle = (i * Math.PI) / pointCount - Math.PI / 2;
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    vertices.push({
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    });
  }

  // Draw the star
  ctx.beginPath();
  if (vertices.length > 0) {
    ctx.moveTo(vertices[0].x, vertices[0].y);
    for (let i = 1; i < vertices.length; i++) {
      ctx.lineTo(vertices[i].x, vertices[i].y);
    }
    ctx.closePath();
  }

  if (obj.filled) {
    ctx.fill();
  } else {
    ctx.stroke();
  }
}
