import type { DrawingObject } from '@/store/drawingStore';
import type { DrawingData } from '@/types/socket';

interface CanvasImageInput {
  id: string;
  centerX: number;
  centerY: number;
  dataUrl: string;
  width: number;
  height: number;
}

export function createCanvasImage(input: CanvasImageInput): DrawingObject {
  return {
    id: input.id,
    type: 'image',
    x: input.centerX - input.width / 2,
    y: input.centerY - input.height / 2,
    width: input.width,
    height: input.height,
    imageData: input.dataUrl,
    color: '#ffffff',
    size: 1,
    alpha: 1,
  };
}

export function toImageDrawingData(image: DrawingObject): DrawingData {
  if (
    image.type !== 'image' ||
    image.x === undefined ||
    image.y === undefined ||
    image.width === undefined ||
    image.height === undefined ||
    !image.imageData
  ) {
    throw new Error('A complete image object is required for renderer synchronization.');
  }
  return {
    id: image.id,
    type: 'image',
    x: image.x,
    y: image.y,
    width: image.width,
    height: image.height,
    color: image.color,
    size: image.size,
    alpha: image.alpha ?? 1,
    imageData: image.imageData,
    timestamp: Date.now(),
  };
}
