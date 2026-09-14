import type { DrawingObject } from '@/store/drawingStore';
import type { jsPDF } from 'jspdf';
import { getStrokePointWidth } from './canvasRendererCommands';
import { WORLD_HEIGHT, WORLD_WIDTH, triangleVertices } from './exportGeometry';

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
  } = {},
): Promise<Blob> {
  const {
    width = WORLD_WIDTH,
    height = WORLD_HEIGHT,
    background = '#0f172a',
    title = 'Drawing',
    pageSize = 'a4',
    orientation = 'landscape',
    margin = 20,
  } = options;

  // Load the PDF renderer only when a user actually exports a PDF. This keeps
  // the initial drawing bundle independent from jsPDF and its HTML helpers.
  const { jsPDF } = await import('jspdf');

  // Create PDF document
  const pdf = new jsPDF({
    orientation,
    unit: 'pt',
    format: pageSize === 'custom' ? [width, height] : pageSize,
  });

  // Get page dimensions
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  // Calculate scale to fit canvas on page with margins
  const availableWidth = pageWidth - 2 * margin;
  const availableHeight = pageHeight - 2 * margin;
  const widthScale = availableWidth / width;
  const heightScale = availableHeight / height;
  const segmentCount = getPdfExportSegmentCount(width, height, pageWidth, pageHeight, margin);
  const fitsOnOnePage = segmentCount === 1;
  const scale = fitsOnOnePage ? Math.min(widthScale, heightScale) : widthScale;
  const scaledWidth = width * scale;
  const offsetX = (pageWidth - scaledWidth) / 2;
  const segmentHeight = availableHeight / scale;

  // A tall imported document is split into standard PDF pages. This avoids
  // jsPDF's 14,400 user-unit page limit while retaining the source scale and
  // keeping each page's objects in their original z-order.
  for (let pageIndex = 0; pageIndex < segmentCount; pageIndex++) {
    if (pageIndex > 0) pdf.addPage();

    const segmentStart = pageIndex * segmentHeight;
    const segmentEnd = Math.min(height, segmentStart + segmentHeight);
    const segmentContentHeight = (segmentEnd - segmentStart) * scale;
    const offsetY = fitsOnOnePage
      ? (pageHeight - height * scale) / 2
      : margin - segmentStart * scale;

    pdf.setFillColor(background);
    pdf.rect(offsetX, fitsOnOnePage ? offsetY : margin, scaledWidth, segmentContentHeight, 'F');

    for (const obj of objects) {
      if (obj.hidden || !objectIntersectsVerticalSegment(obj, segmentStart, segmentEnd)) continue;
      renderObjectToPDF(pdf, obj, offsetX, offsetY, scale);
    }
  }

  // Add metadata
  pdf.setProperties({
    title: title,
    subject: 'Drawing exported from SketchFlow',
    creator: 'SketchFlow',
  });

  // Return as blob
  return pdf.output('blob');
}

export function getPdfExportSegmentCount(
  width: number,
  height: number,
  pageWidth: number,
  pageHeight: number,
  margin: number,
): number {
  const availableWidth = pageWidth - 2 * margin;
  const availableHeight = pageHeight - 2 * margin;
  const widthScale = availableWidth / width;
  const heightScale = availableHeight / height;
  if (widthScale <= heightScale + 0.001) return 1;
  return Math.max(1, Math.ceil(height / (availableHeight / widthScale)));
}

function objectIntersectsVerticalSegment(
  obj: DrawingObject,
  segmentStart: number,
  segmentEnd: number,
): boolean {
  const bounds = getObjectVerticalBounds(obj);
  return bounds === null || (bounds.max >= segmentStart && bounds.min <= segmentEnd);
}

function getObjectVerticalBounds(obj: DrawingObject): { min: number; max: number } | null {
  if (obj.points?.length) {
    return {
      min: Math.min(...obj.points.map((point) => point.y)),
      max: Math.max(...obj.points.map((point) => point.y)),
    };
  }
  if (obj.y === undefined) return null;

  const height = obj.height ?? (obj.type === 'text' ? (obj.fontSize ?? 24) : 0);
  return { min: obj.y, max: obj.y + Math.max(0, height) };
}

export function renderObjectToPDF(
  pdf: jsPDF,
  obj: DrawingObject,
  offsetX: number,
  offsetY: number,
  scale: number,
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
      if (obj.points?.length === 1) {
        const point = obj.points[0];
        const width = getStrokePointWidth(point, obj.size);
        pdf.setLineWidth(width * scale);
        pdf.ellipse(
          offsetX + point.x * scale,
          offsetY + point.y * scale,
          (width * scale) / 2,
          (width * scale) / 2,
          'F',
        );
        break;
      }
      if (obj.points && obj.points.length > 1) {
        const scaledPoints = obj.points.map((p) => ({
          x: offsetX + p.x * scale,
          y: offsetY + p.y * scale,
        }));

        // Draw as a series of line segments
        for (let i = 1; i < scaledPoints.length; i++) {
          pdf.setLineWidth(getStrokePointWidth(obj.points[i], obj.size) * scale);
          pdf.line(
            scaledPoints[i - 1].x,
            scaledPoints[i - 1].y,
            scaledPoints[i].x,
            scaledPoints[i].y,
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
          offsetY + (obj.y + (obj.height || 0)) * scale,
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
      {
        const vertices = triangleVertices(obj);
        if (!vertices) break;
        const points = vertices.map((point) => ({
          x: offsetX + point.x * scale,
          y: offsetY + point.y * scale,
        }));

        if (obj.filled) {
          pdf.triangle(
            points[0].x,
            points[0].y,
            points[1].x,
            points[1].y,
            points[2].x,
            points[2].y,
            'F',
          );
        } else {
          pdf.triangle(
            points[0].x,
            points[0].y,
            points[1].x,
            points[1].y,
            points[2].x,
            points[2].y,
            'S',
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
            offsetY + (obj.y! + fontSize / 1.5) * scale + i * lineHeight,
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
      renderImageToPDF(pdf, obj, offsetX, offsetY, scale);
      break;
  }

  // Reset graphics state
  if (alpha < 1) {
    const normalState = pdf.GState({ opacity: 1, 'stroke-opacity': 1 });
    pdf.setGState(normalState);
  }
}

/**
 * Add an imported raster page to the PDF. This stays synchronous because
 * jsPDF accepts data URLs directly; keeping it in the object loop preserves
 * the canvas z-order, so later annotations are drawn above the page image.
 */
export function renderImageToPDF(
  pdf: jsPDF,
  obj: DrawingObject,
  offsetX: number,
  offsetY: number,
  scale: number,
): void {
  if (
    !obj.imageData ||
    obj.x === undefined ||
    obj.y === undefined ||
    obj.width === undefined ||
    obj.height === undefined
  ) {
    return;
  }

  const imageFormat = getPdfImageFormat(obj.imageData);
  const rotation = obj.rotation ?? 0;
  pdf.addImage(
    obj.imageData,
    imageFormat,
    offsetX + obj.x * scale,
    offsetY + obj.y * scale,
    obj.width * scale,
    obj.height * scale,
    undefined,
    'FAST',
    rotation,
  );
}

function getPdfImageFormat(imageData: string): 'PNG' | 'JPEG' | 'WEBP' {
  const match = /^data:image\/(png|jpe?g|webp);/i.exec(imageData);
  if (!match) {
    throw new Error(
      'PDF export encountered an image with an unsupported format. Re-import the PDF and try again.',
    );
  }
  const subtype = match[1].toLowerCase();
  return subtype === 'jpg' || subtype === 'jpeg' ? 'JPEG' : subtype === 'webp' ? 'WEBP' : 'PNG';
}

function renderArrowToPDF(
  pdf: jsPDF,
  obj: DrawingObject,
  offsetX: number,
  offsetY: number,
  scale: number,
): void {
  if (!obj.points || obj.points.length < 2) return;

  const scaledPoints = obj.points.map((p) => ({
    x: offsetX + p.x * scale,
    y: offsetY + p.y * scale,
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
      y: end.y - headLength * Math.sin(angle - headAngle),
    };
    const wing2 = {
      x: end.x - headLength * Math.cos(angle + headAngle),
      y: end.y - headLength * Math.sin(angle + headAngle),
    };

    pdf.line(wing1.x, wing1.y, end.x, end.y);
    pdf.line(end.x, end.y, wing2.x, wing2.y);
  }
}

function renderStarToPDF(
  pdf: jsPDF,
  obj: DrawingObject,
  offsetX: number,
  offsetY: number,
  scale: number,
): void {
  if (obj.x === undefined || obj.y === undefined || !obj.width || !obj.height) return;

  const cx = offsetX + (obj.x + obj.width / 2) * scale;
  const cy = offsetY + (obj.y + obj.height / 2) * scale;
  const outerRadius = (Math.min(obj.width, obj.height) / 2) * scale;
  const innerRadius = outerRadius * 0.38; // Standard 5-pointed star ratio
  const points = obj.properties?.pointCount || 5;

  // Generate star vertices
  const vertices: { x: number; y: number }[] = [];
  for (let i = 0; i < points * 2; i++) {
    const angle = (i * Math.PI) / points - Math.PI / 2;
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    vertices.push({
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
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
