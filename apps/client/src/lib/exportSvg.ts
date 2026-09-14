import type { DrawingObject } from '@/store/drawingStore';
import { getStrokePointWidth } from './canvasRendererCommands';
import { WORLD_HEIGHT, WORLD_WIDTH, triangleVertices } from './exportGeometry';

export function exportAsSVG(
  objects: DrawingObject[],
  options: {
    width?: number;
    height?: number;
    background?: string;
  } = {},
): string {
  const { width = WORLD_WIDTH, height = WORLD_HEIGHT, background = '#0f172a' } = options;

  const elements: string[] = [];

  // Background
  elements.push(`<rect width="${width}" height="${height}" fill="${background}"/>`);

  // Render objects
  for (const obj of objects) {
    if (obj.hidden) continue;
    const svg = objectToSVG(obj);
    if (!svg) continue;
    if (obj.rotation && obj.x !== undefined && obj.y !== undefined) {
      const centerX = obj.x + (obj.width ?? 0) / 2;
      const centerY = obj.y + (obj.height ?? 0) / 2;
      elements.push(`<g transform="rotate(${obj.rotation} ${centerX} ${centerY})">${svg}</g>`);
    } else {
      elements.push(svg);
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  ${elements.join('\n  ')}
</svg>`;
}

function objectToSVG(obj: DrawingObject): string | null {
  const alpha = obj.alpha ?? 1;
  const opacity = alpha < 1 ? ` opacity="${alpha}"` : '';

  switch (obj.type) {
    case 'stroke':
      if (obj.points?.length === 1) {
        const point = obj.points[0];
        const radius = getStrokePointWidth(point, obj.size) / 2;
        return `<circle cx="${point.x}" cy="${point.y}" r="${radius}" fill="${obj.color}"${opacity}/>`;
      }
      if (obj.points && obj.points.length > 1) {
        return obj.points
          .slice(1)
          .map((point, index) => {
            const from = obj.points![index];
            const width = getStrokePointWidth(point, obj.size);
            const d = `M${from.x},${from.y} L${point.x},${point.y}`;
            return `<path d="${d}" stroke="${obj.color}" stroke-width="${width}" fill="none" stroke-linecap="round" stroke-linejoin="round"${opacity}/>`;
          })
          .join('');
      }
      break;

    case 'line':
      if (obj.x !== undefined && obj.y !== undefined) {
        return `<line x1="${obj.x}" y1="${obj.y}" x2="${obj.x + (obj.width || 0)}" y2="${obj.y + (obj.height || 0)}" stroke="${obj.color}" stroke-width="${obj.size}" stroke-linecap="round"${opacity}/>`;
      }
      break;

    case 'rectangle':
      if (obj.x !== undefined && obj.y !== undefined) {
        if (obj.filled) {
          return `<rect x="${obj.x}" y="${obj.y}" width="${obj.width || 0}" height="${obj.height || 0}" fill="${obj.color}"${opacity}/>`;
        } else {
          return `<rect x="${obj.x}" y="${obj.y}" width="${obj.width || 0}" height="${obj.height || 0}" stroke="${obj.color}" stroke-width="${obj.size}" fill="none"${opacity}/>`;
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

        if (obj.filled) {
          return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${obj.color}"${opacity}/>`;
        } else {
          return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" stroke="${obj.color}" stroke-width="${obj.size}" fill="none"${opacity}/>`;
        }
      }
      break;

    case 'triangle': {
      const vertices = triangleVertices(obj);
      if (!vertices) break;
      const points = vertices.map((point) => `${point.x},${point.y}`).join(' ');

      if (obj.filled) {
        return `<polygon points="${points}" fill="${obj.color}"${opacity}/>`;
      } else {
        return `<polygon points="${points}" stroke="${obj.color}" stroke-width="${obj.size}" fill="none"${opacity}/>`;
      }
    }

    case 'text':
      if (obj.x !== undefined && obj.y !== undefined && obj.text) {
        const fontSize = obj.fontSize || 24;
        const lineHeight = fontSize * 1.2;
        const lines = obj.text.split('\n');

        if (lines.length === 1) {
          const escaped = obj.text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
          return `<text x="${obj.x}" y="${obj.y + fontSize}" font-size="${fontSize}" fill="${obj.color}"${opacity}>${escaped}</text>`;
        } else {
          // Multi-line text using tspan elements
          const tspans = lines
            .map((line, i) => {
              const escaped = line
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
              const dy = i === 0 ? fontSize : lineHeight;
              return `<tspan x="${obj.x}" dy="${dy}">${escaped}</tspan>`;
            })
            .join('');
          return `<text font-size="${fontSize}" fill="${obj.color}"${opacity}>${tspans}</text>`;
        }
      }
      break;

    case 'arrow':
      return arrowToSVG(obj, opacity);

    case 'star':
      return starToSVG(obj, opacity);
  }

  return null;
}

function arrowToSVG(obj: DrawingObject, opacity: string): string | null {
  if (!obj.points || obj.points.length < 2) return null;

  const points = obj.points;
  const paths: string[] = [];

  // Main shaft
  paths.push(`M${points[0].x},${points[0].y} L${points[1].x},${points[1].y}`);

  // Arrowhead
  if (points.length >= 5) {
    const tip = points[2];
    const wing1 = points[3];
    const wing2 = points[4];
    paths.push(`M${wing1.x},${wing1.y} L${tip.x},${tip.y} L${wing2.x},${wing2.y}`);
  } else {
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

    paths.push(`M${wing1.x},${wing1.y} L${end.x},${end.y} L${wing2.x},${wing2.y}`);
  }

  return `<path d="${paths.join(' ')}" stroke="${obj.color}" stroke-width="${obj.size}" fill="none" stroke-linecap="round" stroke-linejoin="round"${opacity}/>`;
}

function starToSVG(obj: DrawingObject, opacity: string): string | null {
  if (obj.x === undefined || obj.y === undefined || !obj.width || !obj.height) return null;

  const cx = obj.x + obj.width / 2;
  const cy = obj.y + obj.height / 2;
  const outerRadius = Math.min(obj.width, obj.height) / 2;
  const innerRadius = outerRadius * 0.38;
  const pointCount = obj.properties?.pointCount || 5;

  // Generate star vertices
  const vertices: string[] = [];
  for (let i = 0; i < pointCount * 2; i++) {
    const angle = (i * Math.PI) / pointCount - Math.PI / 2;
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    vertices.push(`${cx + radius * Math.cos(angle)},${cy + radius * Math.sin(angle)}`);
  }

  if (obj.filled) {
    return `<polygon points="${vertices.join(' ')}" fill="${obj.color}"${opacity}/>`;
  } else {
    return `<polygon points="${vertices.join(' ')}" stroke="${obj.color}" stroke-width="${obj.size}" fill="none"${opacity}/>`;
  }
}
