import type { DrawingObject } from '@/store/drawingStore';
import type { jsPDF } from 'jspdf';

const WORLD_WIDTH = 4096;
const WORLD_HEIGHT = 4096;

export type ExportQuality = '1x' | '2x' | '4x' | 'retina' | 'print';

/**
 * Get scale factor for export quality
 */
export function getScaleForQuality(quality: ExportQuality): number {
  switch (quality) {
    case '1x': return 1;
    case '2x': return 2;
    case 'retina': return 2; // Same as 2x
    case '4x': return 4;
    case 'print': return 4; // High quality for printing
    default: return 1;
  }
}

/**
 * Export canvas as PNG image with quality options
 */
export async function exportAsPNG(
  objects: DrawingObject[],
  options: {
    width?: number;
    height?: number;
    background?: string;
    scale?: number;
    quality?: ExportQuality;
    format?: 'png' | 'jpeg' | 'webp';
    jpegQuality?: number; // 0-1, only for JPEG
  } = {}
): Promise<Blob> {
  const {
    width = WORLD_WIDTH,
    height = WORLD_HEIGHT,
    background = '#0f172a',
    scale: customScale,
    quality = '1x',
    format = 'png',
    jpegQuality = 0.95
  } = options;

  const scale = customScale ?? getScaleForQuality(quality);

  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;

  const ctx = canvas.getContext('2d', {
    alpha: format === 'png', // Only use alpha for PNG
    willReadFrequently: false,
  })!;

  ctx.scale(scale, scale);

  // Fill background
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  // Render all objects
  renderObjectsToContext(ctx, objects);

  // Determine MIME type and quality
  let mimeType: string;
  let qualityParam: number | undefined;

  switch (format) {
    case 'jpeg':
      mimeType = 'image/jpeg';
      qualityParam = jpegQuality;
      break;
    case 'webp':
      mimeType = 'image/webp';
      qualityParam = jpegQuality; // WebP also uses quality parameter
      break;
    case 'png':
    default:
      mimeType = 'image/png';
      qualityParam = undefined; // PNG doesn't use quality parameter
      break;
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error(`Failed to export ${format.toUpperCase()}`));
    }, mimeType, qualityParam);
  });
}

/**
 * Export canvas as SVG
 */
export function exportAsSVG(
  objects: DrawingObject[],
  options: {
    width?: number;
    height?: number;
    background?: string;
  } = {}
): string {
  const { width = WORLD_WIDTH, height = WORLD_HEIGHT, background = '#0f172a' } = options;

  const elements: string[] = [];

  // Background
  elements.push(`<rect width="${width}" height="${height}" fill="${background}"/>`);

  // Render objects
  for (const obj of objects) {
    const svg = objectToSVG(obj);
    if (svg) elements.push(svg);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  ${elements.join('\n  ')}
</svg>`;
}

/**
 * Download a file
 */
export function downloadFile(data: Blob | string, filename: string, mimeType?: string): void {
  const blob = typeof data === 'string'
    ? new Blob([data], { type: mimeType || 'text/plain' })
    : data;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Export canvas as PDF document
 */
export async function exportAsPDF(
  objects: DrawingObject[],
  options: {
    width?: number;
    height?: number;
    background?: string;
    title?: string;
    pageSize?: 'a4' | 'letter' | 'legal' | 'custom';
    orientation?: 'portrait' | 'landscape';
    margin?: number;
  } = {}
): Promise<Blob> {
  const {
    width = WORLD_WIDTH,
    height = WORLD_HEIGHT,
    background = '#0f172a',
    title = 'Drawing',
    pageSize = 'a4',
    orientation = 'landscape',
    margin = 20
  } = options;

  // Load the PDF renderer only when a user actually exports a PDF. This keeps
  // the initial drawing bundle independent from jsPDF and its HTML helpers.
  const { jsPDF } = await import('jspdf');

  // Create PDF document
  const pdf = new jsPDF({
    orientation,
    unit: 'pt',
    format: pageSize === 'custom' ? [width, height] : pageSize
  });

  // Get page dimensions
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  // Calculate scale to fit canvas on page with margins
  const availableWidth = pageWidth - 2 * margin;
  const availableHeight = pageHeight - 2 * margin;
  const scale = Math.min(availableWidth / width, availableHeight / height);

  // Calculate centered position
  const scaledWidth = width * scale;
  const scaledHeight = height * scale;
  const offsetX = (pageWidth - scaledWidth) / 2;
  const offsetY = (pageHeight - scaledHeight) / 2;

  // Draw background
  pdf.setFillColor(background);
  pdf.rect(offsetX, offsetY, scaledWidth, scaledHeight, 'F');

  // Render each object to PDF
  for (const obj of objects) {
    renderObjectToPDF(pdf, obj, offsetX, offsetY, scale);
  }

  // Add metadata
  pdf.setProperties({
    title: title,
    subject: 'Drawing exported from SketchFlow',
    creator: 'SketchFlow'
  });

  // Return as blob
  return pdf.output('blob');
}

/**
 * Render a single drawing object to PDF
 */
function renderObjectToPDF(
  pdf: jsPDF,
  obj: DrawingObject,
  offsetX: number,
  offsetY: number,
  scale: number
): void {
  const alpha = obj.alpha ?? 1;

  // Set drawing state - jsPDF uses separate methods for colors
  pdf.setDrawColor(obj.color);
  pdf.setFillColor(obj.color);
  pdf.setLineWidth(obj.size * scale);
  pdf.setLineCap('round');
  pdf.setLineJoin('round');

  // Apply alpha using graphics state if supported
  if (alpha < 1) {
    const gState = pdf.GState({ opacity: alpha, 'stroke-opacity': alpha });
    pdf.setGState(gState);
  }

  switch (obj.type) {
    case 'stroke':
      if (obj.points && obj.points.length > 1) {
        const scaledPoints = obj.points.map(p => ({
          x: offsetX + p.x * scale,
          y: offsetY + p.y * scale
        }));

        // Draw as a series of line segments
        for (let i = 1; i < scaledPoints.length; i++) {
          pdf.line(
            scaledPoints[i - 1].x,
            scaledPoints[i - 1].y,
            scaledPoints[i].x,
            scaledPoints[i].y
          );
        }
      }
      break;

    case 'line':
      if (obj.x !== undefined && obj.y !== undefined) {
        pdf.line(
          offsetX + obj.x * scale,
          offsetY + obj.y * scale,
          offsetX + (obj.x + (obj.width || 0)) * scale,
          offsetY + (obj.y + (obj.height || 0)) * scale
        );
      }
      break;

    case 'rectangle':
      if (obj.x !== undefined && obj.y !== undefined) {
        const x = offsetX + obj.x * scale;
        const y = offsetY + obj.y * scale;
        const w = (obj.width || 0) * scale;
        const h = (obj.height || 0) * scale;

        if (obj.filled) {
          pdf.rect(x, y, w, h, 'F');
        } else {
          pdf.rect(x, y, w, h, 'S');
        }
      }
      break;

    case 'ellipse':
    case 'circle':
      if (obj.x !== undefined && obj.y !== undefined && obj.width && obj.height) {
        const cx = offsetX + (obj.x + obj.width / 2) * scale;
        const cy = offsetY + (obj.y + obj.height / 2) * scale;
        const rx = Math.abs(obj.width / 2) * scale;
        const ry = Math.abs(obj.height / 2) * scale;

        if (obj.filled) {
          pdf.ellipse(cx, cy, rx, ry, 'F');
        } else {
          pdf.ellipse(cx, cy, rx, ry, 'S');
        }
      }
      break;

    case 'triangle':
      if (obj.x !== undefined && obj.y !== undefined && obj.width && obj.height) {
        const x = offsetX + obj.x * scale;
        const y = offsetY + obj.y * scale;
        const w = obj.width * scale;
        const h = obj.height * scale;

        const points = [
          { x: x + w / 2, y: y },         // Top
          { x: x + w, y: y + h },         // Bottom right
          { x: x, y: y + h }              // Bottom left
        ];

        if (obj.filled) {
          pdf.triangle(
            points[0].x, points[0].y,
            points[1].x, points[1].y,
            points[2].x, points[2].y,
            'F'
          );
        } else {
          pdf.triangle(
            points[0].x, points[0].y,
            points[1].x, points[1].y,
            points[2].x, points[2].y,
            'S'
          );
        }
      }
      break;

    case 'text':
      if (obj.x !== undefined && obj.y !== undefined && obj.text) {
        const fontSize = (obj.fontSize || 24) * scale;
        pdf.setFontSize(fontSize);
        pdf.setTextColor(obj.color);

        const lines = obj.text.split('\n');
        const lineHeight = fontSize * 1.2;

        lines.forEach((line, i) => {
          pdf.text(
            line,
            offsetX + obj.x! * scale,
            offsetY + (obj.y! + fontSize / 1.5) * scale + i * lineHeight
          );
        });
      }
      break;

    case 'arrow':
      renderArrowToPDF(pdf, obj, offsetX, offsetY, scale);
      break;

    case 'star':
      renderStarToPDF(pdf, obj, offsetX, offsetY, scale);
      break;

    case 'image':
      // Images require async handling - would need special handling
      break;
  }

  // Reset graphics state
  if (alpha < 1) {
    const normalState = pdf.GState({ opacity: 1, 'stroke-opacity': 1 });
    pdf.setGState(normalState);
  }
}

/**
 * Render arrow shape to PDF
 */
function renderArrowToPDF(
  pdf: jsPDF,
  obj: DrawingObject,
  offsetX: number,
  offsetY: number,
  scale: number
): void {
  if (!obj.points || obj.points.length < 2) return;

  const scaledPoints = obj.points.map(p => ({
    x: offsetX + p.x * scale,
    y: offsetY + p.y * scale
  }));

  // Draw the main shaft
  pdf.line(scaledPoints[0].x, scaledPoints[0].y, scaledPoints[1].x, scaledPoints[1].y);

  // Draw the arrowhead if we have head points
  if (scaledPoints.length >= 5) {
    const tip = scaledPoints[2];
    const wing1 = scaledPoints[3];
    const wing2 = scaledPoints[4];

    // Draw V-shaped head
    pdf.line(wing1.x, wing1.y, tip.x, tip.y);
    pdf.line(tip.x, tip.y, wing2.x, wing2.y);
  } else {
    // Generate arrowhead based on direction
    const start = scaledPoints[0];
    const end = scaledPoints[1];
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    const headLength = 15 * scale;
    const headAngle = Math.PI / 6; // 30 degrees

    const wing1 = {
      x: end.x - headLength * Math.cos(angle - headAngle),
      y: end.y - headLength * Math.sin(angle - headAngle)
    };
    const wing2 = {
      x: end.x - headLength * Math.cos(angle + headAngle),
      y: end.y - headLength * Math.sin(angle + headAngle)
    };

    pdf.line(wing1.x, wing1.y, end.x, end.y);
    pdf.line(end.x, end.y, wing2.x, wing2.y);
  }
}

/**
 * Render star shape to PDF
 */
function renderStarToPDF(
  pdf: jsPDF,
  obj: DrawingObject,
  offsetX: number,
  offsetY: number,
  scale: number
): void {
  if (obj.x === undefined || obj.y === undefined || !obj.width || !obj.height) return;

  const cx = offsetX + (obj.x + obj.width / 2) * scale;
  const cy = offsetY + (obj.y + obj.height / 2) * scale;
  const outerRadius = Math.min(obj.width, obj.height) / 2 * scale;
  const innerRadius = outerRadius * 0.38; // Standard 5-pointed star ratio
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const points = (obj as any).properties?.pointCount || 5;

  // Generate star vertices
  const vertices: { x: number; y: number }[] = [];
  for (let i = 0; i < points * 2; i++) {
    const angle = (i * Math.PI / points) - Math.PI / 2;
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    vertices.push({
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle)
    });
  }

  // Draw the star as lines
  if (vertices.length > 0) {
    for (let i = 0; i < vertices.length; i++) {
      const next = (i + 1) % vertices.length;
      pdf.line(vertices[i].x, vertices[i].y, vertices[next].x, vertices[next].y);
    }
  }
}

/**
 * Render objects to a 2D canvas context
 */
function renderObjectsToContext(ctx: CanvasRenderingContext2D, objects: DrawingObject[]): void {
  for (const obj of objects) {
    ctx.save();
    ctx.globalAlpha = obj.alpha ?? 1;
    ctx.strokeStyle = obj.color;
    ctx.fillStyle = obj.color;
    ctx.lineWidth = obj.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    switch (obj.type) {
      case 'stroke':
        if (obj.points && obj.points.length > 1) {
          ctx.beginPath();
          ctx.moveTo(obj.points[0].x, obj.points[0].y);
          for (let i = 1; i < obj.points.length; i++) {
            ctx.lineTo(obj.points[i].x, obj.points[i].y);
          }
          ctx.stroke();
        }
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
        if (obj.x !== undefined && obj.y !== undefined && obj.width && obj.height) {
          const x = obj.x;
          const y = obj.y;
          const w = obj.width;
          const h = obj.height;

          ctx.beginPath();
          ctx.moveTo(x + w / 2, y); // Top
          ctx.lineTo(x + w, y + h); // Bottom right
          ctx.lineTo(x, y + h); // Bottom left
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

/**
 * Render arrow shape to canvas context
 */
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
      y: end.y - headLength * Math.sin(angle - headAngle)
    };
    const wing2 = {
      x: end.x - headLength * Math.cos(angle + headAngle),
      y: end.y - headLength * Math.sin(angle + headAngle)
    };

    ctx.beginPath();
    ctx.moveTo(wing1.x, wing1.y);
    ctx.lineTo(end.x, end.y);
    ctx.lineTo(wing2.x, wing2.y);
    ctx.stroke();
  }
}

/**
 * Render star shape to canvas context
 */
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
    const angle = (i * Math.PI / pointCount) - Math.PI / 2;
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    vertices.push({
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle)
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

/**
 * Convert a drawing object to SVG element
 */
function objectToSVG(obj: DrawingObject): string | null {
  const alpha = obj.alpha ?? 1;
  const opacity = alpha < 1 ? ` opacity="${alpha}"` : '';

  switch (obj.type) {
    case 'stroke':
      if (obj.points && obj.points.length > 1) {
        const d = obj.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
        return `<path d="${d}" stroke="${obj.color}" stroke-width="${obj.size}" fill="none" stroke-linecap="round" stroke-linejoin="round"${opacity}/>`;
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

    case 'triangle':
      if (obj.x !== undefined && obj.y !== undefined && obj.width && obj.height) {
        const x = obj.x;
        const y = obj.y;
        const w = obj.width;
        const h = obj.height;
        const points = `${x + w / 2},${y} ${x + w},${y + h} ${x},${y + h}`;

        if (obj.filled) {
          return `<polygon points="${points}" fill="${obj.color}"${opacity}/>`;
        } else {
          return `<polygon points="${points}" stroke="${obj.color}" stroke-width="${obj.size}" fill="none"${opacity}/>`;
        }
      }
      break;

    case 'text':
      if (obj.x !== undefined && obj.y !== undefined && obj.text) {
        const fontSize = obj.fontSize || 24;
        const lineHeight = fontSize * 1.2;
        const lines = obj.text.split('\n');

        if (lines.length === 1) {
          const escaped = obj.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          return `<text x="${obj.x}" y="${obj.y + fontSize}" font-size="${fontSize}" fill="${obj.color}"${opacity}>${escaped}</text>`;
        } else {
          // Multi-line text using tspan elements
          const tspans = lines.map((line, i) => {
            const escaped = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const dy = i === 0 ? fontSize : lineHeight;
            return `<tspan x="${obj.x}" dy="${dy}">${escaped}</tspan>`;
          }).join('');
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

/**
 * Convert arrow to SVG
 */
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
      y: end.y - headLength * Math.sin(angle - headAngle)
    };
    const wing2 = {
      x: end.x - headLength * Math.cos(angle + headAngle),
      y: end.y - headLength * Math.sin(angle + headAngle)
    };

    paths.push(`M${wing1.x},${wing1.y} L${end.x},${end.y} L${wing2.x},${wing2.y}`);
  }

  return `<path d="${paths.join(' ')}" stroke="${obj.color}" stroke-width="${obj.size}" fill="none" stroke-linecap="round" stroke-linejoin="round"${opacity}/>`;
}

/**
 * Convert star to SVG
 */
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
    const angle = (i * Math.PI / pointCount) - Math.PI / 2;
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    vertices.push(`${cx + radius * Math.cos(angle)},${cy + radius * Math.sin(angle)}`);
  }

  if (obj.filled) {
    return `<polygon points="${vertices.join(' ')}" fill="${obj.color}"${opacity}/>`;
  } else {
    return `<polygon points="${vertices.join(' ')}" stroke="${obj.color}" stroke-width="${obj.size}" fill="none"${opacity}/>`;
  }
}
