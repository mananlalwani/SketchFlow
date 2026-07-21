/**
 * Utility for generating project thumbnails
 */
import type { DrawingObject } from '@/store/drawingStore';

const THUMBNAIL_WIDTH = 320;
const THUMBNAIL_HEIGHT = 180;
const THUMBNAIL_QUALITY = 0.8;

/**
 * Generate a thumbnail from drawing objects
 */
export async function generateThumbnail(
  objects: DrawingObject[],
  worldWidth = 4096,
  worldHeight = 4096,
): Promise<string | null> {
  if (objects.length === 0) {
    return null; // No thumbnail for empty canvas
  }

  try {
    // Create an offscreen canvas
    const canvas = document.createElement('canvas');
    canvas.width = THUMBNAIL_WIDTH;
    canvas.height = THUMBNAIL_HEIGHT;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      console.error('Failed to get canvas context for thumbnail');
      return null;
    }

    // Fill background
    ctx.fillStyle = '#1e293b'; // Dark background
    ctx.fillRect(0, 0, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT);

    // Calculate scale to fit world canvas into thumbnail
    const scaleX = THUMBNAIL_WIDTH / worldWidth;
    const scaleY = THUMBNAIL_HEIGHT / worldHeight;
    const scale = Math.min(scaleX, scaleY);

    // Center the content
    const offsetX = (THUMBNAIL_WIDTH - worldWidth * scale) / 2;
    const offsetY = (THUMBNAIL_HEIGHT - worldHeight * scale) / 2;

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    // Render all objects
    for (const obj of objects) {
      ctx.save();
      ctx.globalAlpha = obj.alpha ?? 1;
      ctx.strokeStyle = obj.color;
      ctx.fillStyle = obj.color;
      ctx.lineWidth = obj.size;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      try {
        if (obj.type === 'stroke' && obj.points && obj.points.length > 0) {
          ctx.beginPath();
          ctx.moveTo(obj.points[0].x, obj.points[0].y);
          for (let i = 1; i < obj.points.length; i++) {
            ctx.lineTo(obj.points[i].x, obj.points[i].y);
          }
          ctx.stroke();
        } else if (
          obj.type === 'line' &&
          obj.x !== undefined &&
          obj.y !== undefined &&
          obj.width !== undefined &&
          obj.height !== undefined
        ) {
          ctx.beginPath();
          ctx.moveTo(obj.x, obj.y);
          ctx.lineTo(obj.x + obj.width, obj.y + obj.height);
          ctx.stroke();
        } else if (
          obj.type === 'arrow' &&
          obj.x !== undefined &&
          obj.y !== undefined &&
          obj.width !== undefined &&
          obj.height !== undefined
        ) {
          // Draw arrow shaft
          ctx.beginPath();
          ctx.moveTo(obj.x, obj.y);
          ctx.lineTo(obj.x + obj.width, obj.y + obj.height);
          ctx.stroke();

          // Draw arrow head (simplified for thumbnail)
          const angle = Math.atan2(obj.height, obj.width);
          const headLength = Math.min(
            20,
            Math.sqrt(obj.width * obj.width + obj.height * obj.height) * 0.3,
          );
          ctx.beginPath();
          ctx.moveTo(obj.x + obj.width, obj.y + obj.height);
          ctx.lineTo(
            obj.x + obj.width - headLength * Math.cos(angle - Math.PI / 6),
            obj.y + obj.height - headLength * Math.sin(angle - Math.PI / 6),
          );
          ctx.moveTo(obj.x + obj.width, obj.y + obj.height);
          ctx.lineTo(
            obj.x + obj.width - headLength * Math.cos(angle + Math.PI / 6),
            obj.y + obj.height - headLength * Math.sin(angle + Math.PI / 6),
          );
          ctx.stroke();
        } else if (
          obj.type === 'rectangle' &&
          obj.x !== undefined &&
          obj.y !== undefined &&
          obj.width !== undefined &&
          obj.height !== undefined
        ) {
          if (obj.filled) {
            ctx.fillRect(obj.x, obj.y, obj.width, obj.height);
          } else {
            ctx.strokeRect(obj.x, obj.y, obj.width, obj.height);
          }
        } else if (
          obj.type === 'ellipse' &&
          obj.x !== undefined &&
          obj.y !== undefined &&
          obj.width !== undefined &&
          obj.height !== undefined
        ) {
          ctx.beginPath();
          ctx.ellipse(
            obj.x + obj.width / 2,
            obj.y + obj.height / 2,
            Math.abs(obj.width) / 2,
            Math.abs(obj.height) / 2,
            0,
            0,
            Math.PI * 2,
          );
          if (obj.filled) {
            ctx.fill();
          } else {
            ctx.stroke();
          }
        } else if (
          obj.type === 'circle' &&
          obj.x !== undefined &&
          obj.y !== undefined &&
          obj.width !== undefined
        ) {
          const radius = Math.abs(obj.width) / 2;
          ctx.beginPath();
          ctx.arc(obj.x + radius, obj.y + radius, radius, 0, Math.PI * 2);
          if (obj.filled) {
            ctx.fill();
          } else {
            ctx.stroke();
          }
        } else if (obj.type === 'triangle' && obj.points && obj.points.length >= 3) {
          ctx.beginPath();
          ctx.moveTo(obj.points[0].x, obj.points[0].y);
          for (let i = 1; i < obj.points.length; i++) {
            ctx.lineTo(obj.points[i].x, obj.points[i].y);
          }
          ctx.closePath();
          if (obj.filled) {
            ctx.fill();
          } else {
            ctx.stroke();
          }
        } else if (obj.type === 'star' && obj.points && obj.points.length > 0) {
          ctx.beginPath();
          ctx.moveTo(obj.points[0].x, obj.points[0].y);
          for (let i = 1; i < obj.points.length; i++) {
            ctx.lineTo(obj.points[i].x, obj.points[i].y);
          }
          ctx.closePath();
          if (obj.filled) {
            ctx.fill();
          } else {
            ctx.stroke();
          }
        } else if (obj.type === 'text' && obj.text && obj.x !== undefined && obj.y !== undefined) {
          const fontSize = (obj.fontSize || 24) * 0.8; // Slightly smaller for thumbnail
          ctx.font = `${fontSize}px Inter, system-ui, sans-serif`;
          ctx.fillText(obj.text, obj.x, obj.y);
        } else if (
          obj.type === 'image' &&
          obj.imageData &&
          obj.x !== undefined &&
          obj.y !== undefined &&
          obj.width !== undefined &&
          obj.height !== undefined
        ) {
          // Skip images in thumbnails to keep them lightweight
          // Just draw a placeholder rectangle
          ctx.strokeRect(obj.x, obj.y, obj.width, obj.height);
        }
      } catch (err) {
        console.warn('Failed to render object in thumbnail:', err);
        // Continue rendering other objects
      }

      ctx.restore();
    }

    ctx.restore();

    // Convert to base64 JPEG
    return canvas.toDataURL('image/jpeg', THUMBNAIL_QUALITY);
  } catch (error) {
    console.error('Failed to generate thumbnail:', error);
    return null;
  }
}

/**
 * Debounced thumbnail generation for performance
 */
export class ThumbnailGenerator {
  private timeoutId: number | null = null;
  private readonly debounceMs: number;

  constructor(debounceMs = 1000) {
    this.debounceMs = debounceMs;
  }

  /**
   * Generate thumbnail with debouncing
   */
  async generate(
    objects: DrawingObject[],
    worldWidth?: number,
    worldHeight?: number,
  ): Promise<string | null> {
    return new Promise((resolve) => {
      if (this.timeoutId !== null) {
        window.clearTimeout(this.timeoutId);
      }

      this.timeoutId = window.setTimeout(async () => {
        const thumbnail = await generateThumbnail(objects, worldWidth, worldHeight);
        resolve(thumbnail);
        this.timeoutId = null;
      }, this.debounceMs);
    });
  }

  /**
   * Cancel pending thumbnail generation
   */
  cancel(): void {
    if (this.timeoutId !== null) {
      window.clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }
}
