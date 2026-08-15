import type { DrawingData, StrokeData } from '@/types/socket';
import { z } from 'zod';

export type RendererObject = DrawingData | StrokeData;

export interface RendererLoadSceneMessage {
  type: 'load-scene';
  requestId: string;
  drawings: DrawingData[];
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

const rendererWorkerEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready') }),
  z.object({ type: z.literal('init-error'), reason: z.string() }),
  z.object({
    type: z.literal('scene-applied'),
    requestId: z.string(),
    objectCount: z.number(),
    ingestionMs: z.number(),
  }),
  z.object({
    type: z.literal('frame-rendered'),
    requestId: z.string().optional(),
    viewportSequence: z.number().optional(),
    renderMs: z.number(),
    retainedObjectCount: z.number(),
    visibleObjectCount: z.number(),
    culledObjectCount: z.number(),
  }),
]);

export function createSceneLoadMessage(
  requestId: string,
  objects: readonly RendererObject[],
): RendererLoadSceneMessage {
  const drawings: DrawingData[] = [];
  const strokes: StrokeData[] = [];
  for (const object of objects) {
    if ('x0' in object) strokes.push(object);
    else drawings.push(object);
  }
  return { type: 'load-scene', requestId, drawings, strokes };
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Worker messages are untrusted platform payloads parsed by the schema below.
export function isRendererWorkerEvent(value: unknown): value is RendererWorkerEvent {
  return rendererWorkerEventSchema.safeParse(value).success;
}
