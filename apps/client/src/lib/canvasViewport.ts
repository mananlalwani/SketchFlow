export const WORLD_WIDTH = 51200;
export const WORLD_HEIGHT = 28800;

export type TriangleMode = 'right' | '45-45-90' | '30-60-90';
export interface CanvasPoint { x: number; y: number; }

export function constrainView(
  viewX: number,
  viewY: number,
  zoom: number,
  canvasWidth: number,
  canvasHeight: number,
): CanvasPoint {
  const maxX = Math.max(0, WORLD_WIDTH - canvasWidth / zoom);
  const maxY = Math.max(0, WORLD_HEIGHT - canvasHeight / zoom);
  return {
    x: Math.max(0, Math.min(maxX, viewX)),
    y: Math.max(0, Math.min(maxY, viewY)),
  };
}

export function calculateTriangleVertices(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  mode: TriangleMode,
): CanvasPoint[] {
  const width = endX - startX;
  const height = endY - startY;
  if (mode === 'right') {
    return [{ x: startX, y: startY }, { x: endX, y: startY }, { x: startX, y: endY }];
  }

  const signX = width >= 0 ? 1 : -1;
  const signY = height >= 0 ? 1 : -1;
  if (mode === '45-45-90') {
    const size = Math.min(Math.abs(width), Math.abs(height));
    return [{ x: startX, y: startY }, { x: startX + signX * size, y: startY }, { x: startX, y: startY + signY * size }];
  }

  const shortLeg = Math.abs(height) / Math.sqrt(3);
  return [{ x: startX, y: startY }, { x: startX + signX * shortLeg, y: startY + signY * Math.abs(height) }, { x: startX, y: startY + signY * Math.abs(height) }];
}
