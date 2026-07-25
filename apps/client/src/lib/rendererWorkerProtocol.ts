import type { ShapeData, StrokeData } from '@/types/socket';

export type RendererObject = ShapeData | StrokeData;

export interface RendererLoadSceneMessage {
  type: 'load-scene';
  requestId: string;
  shapes: ShapeData[];
  strokes: StrokeData[];
}

export interface RendererViewportUpdateMessage {
  type: 'viewport';
  zoom: number;
  viewX: number;
  viewY: number;
  canvasWidth: number;
  canvasHeight: number;
  dpr: number;
  sequence?: number;
}

export type RendererWorkerEvent =
  | { type: 'ready' }
  | { type: 'init-error'; reason: string }
  | { type: 'scene-applied'; requestId: string; objectCount: number; ingestionMs: number }
  | {
      type: 'frame-rendered';
      requestId?: string;
      viewportSequence?: number;
      renderMs: number;
      retainedObjectCount: number;
      visibleObjectCount: number;
      culledObjectCount: number;
    };

export function createSceneLoadMessage(
  requestId: string,
  objects: readonly RendererObject[],
): RendererLoadSceneMessage {
  const shapes: ShapeData[] = [];
  const strokes: StrokeData[] = [];
  for (const object of objects) {
    if ('x0' in object) strokes.push(object);
    else shapes.push(object);
  }
  return { type: 'load-scene', requestId, shapes, strokes };
}

export function isRendererWorkerEvent(value: unknown): value is RendererWorkerEvent {
  if (!value || typeof value !== 'object' || !('type' in value)) return false;
  const event = value as Record<string, unknown>;
  if (event.type === 'ready') return true;
  if (event.type === 'init-error') return typeof event.reason === 'string';
  if (event.type === 'scene-applied') {
    return (
      typeof event.requestId === 'string' &&
      typeof event.objectCount === 'number' &&
      typeof event.ingestionMs === 'number'
    );
  }
  if (event.type === 'frame-rendered') {
    return (
      typeof event.renderMs === 'number' &&
      typeof event.retainedObjectCount === 'number' &&
      typeof event.visibleObjectCount === 'number' &&
      typeof event.culledObjectCount === 'number'
    );
  }
  return false;
}
