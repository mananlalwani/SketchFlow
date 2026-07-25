import { isIOS } from '@/lib/utils';

export interface CanvasViewportState {
  zoom: number;
  viewX: number;
  viewY: number;
}

export interface CanvasSize {
  width: number;
  height: number;
}

export interface RendererViewportMessage extends CanvasViewportState {
  type: 'viewport';
  canvasWidth: number;
  canvasHeight: number;
  dpr: number;
}

export function createRendererViewportMessage(
  { width, height }: CanvasSize,
  { zoom, viewX, viewY }: CanvasViewportState,
  dpr = isIOS() ? 1 : window.devicePixelRatio || 1,
): RendererViewportMessage {
  return {
    type: 'viewport',
    zoom,
    viewX,
    viewY,
    canvasWidth: width,
    canvasHeight: height,
    dpr,
  };
}

export function postRendererViewport(
  worker: Worker | null,
  size: CanvasSize,
  viewport: CanvasViewportState,
) {
  worker?.postMessage(createRendererViewportMessage(size, viewport));
}
