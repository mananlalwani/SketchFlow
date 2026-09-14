import type { DrawingObject } from '@/store/drawingStore';
import { WORLD_HEIGHT, WORLD_WIDTH } from './exportGeometry';
import { renderObjectsToContext } from './exportCanvas';

export type ExportQuality = '1x' | '2x' | '4x' | 'retina' | 'print';

export function getScaleForQuality(quality: ExportQuality): number {
  switch (quality) {
    case '1x':
      return 1;
    case '2x':
      return 2;
    case 'retina':
      return 2; // Same as 2x
    case '4x':
      return 4;
    case 'print':
      return 4; // High quality for printing
    default:
      return 1;
  }
}

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
  } = {},
): Promise<Blob> {
  const {
    width = WORLD_WIDTH,
    height = WORLD_HEIGHT,
    background = '#0f172a',
    scale: customScale,
    quality = '1x',
    format = 'png',
    jpegQuality = 0.95,
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
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error(`Failed to export ${format.toUpperCase()}`));
      },
      mimeType,
      qualityParam,
    );
  });
}
