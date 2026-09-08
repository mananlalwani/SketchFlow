import type { DrawingData, StrokeData } from '@/types/socket';
import {
  createRendererViewportMessage,
  type CanvasSize,
  type CanvasViewportState,
  type RendererViewportMessage,
} from './canvasRendererViewport';
import { createSceneLoadMessage, type RendererLoadSceneMessage } from './rendererWorkerProtocol';

export type PresentationObject = DrawingData | StrokeData;
export type PresentationCommand =
  | RendererLoadSceneMessage
  | RendererViewportMessage
  | { type: 'shape'; data: DrawingData }
  | { type: 'clear-shape'; data: DrawingData }
  | { type: 'strokes'; data: StrokeData[] }
  | { type: 'clear' }
  | { type: 'clear-region'; x: number; y: number; width: number; height: number }
  | { type: 'remove-group'; groupId: string };

export interface CanvasPresentationAdapter {
  readonly ready?: boolean;
  send(message: PresentationCommand): void;
  dispose?(): void;
}

export interface CanvasPresentationScheduler {
  frame(callback: () => void): number;
  cancel(handle: number): void;
}

const defaultScheduler: CanvasPresentationScheduler = {
  frame: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle),
};

/**
 * Deep presentation module for the canvas. Callers submit semantic scene and
 * viewport changes; transport readiness, frame batching, and message shape
 * stay here. The adapter is intentionally small so worker and main-thread
 * implementations can be exercised through the same interface.
 */
export class CanvasPresentation {
  private readonly adapter: CanvasPresentationAdapter;
  private readonly scheduler: CanvasPresentationScheduler;
  private readonly pending: PresentationCommand[] = [];
  private strokeBatch: StrokeData[] = [];
  private strokeFrame: number | null = null;
  private viewport: { size: CanvasSize; state: CanvasViewportState } | null = null;
  private viewportFrame: number | null = null;
  private disposed = false;
  private isReady: boolean;

  constructor(adapter: CanvasPresentationAdapter, scheduler = defaultScheduler) {
    this.adapter = adapter;
    this.scheduler = scheduler;
    this.isReady = adapter.ready ?? true;
  }

  get ready() {
    return this.isReady && !this.disposed;
  }

  markReady() {
    if (this.disposed) return;
    this.isReady = true;
    this.flush();
  }

  markUnavailable() {
    this.isReady = false;
  }

  loadScene(requestId: string, objects: readonly PresentationObject[]) {
    this.enqueue(createSceneLoadMessage(requestId, objects));
  }

  appendStroke(stroke: StrokeData) {
    if (this.disposed) return;
    this.strokeBatch.push(stroke);
    if (this.strokeFrame === null) {
      this.strokeFrame = this.scheduler.frame(() => {
        this.strokeFrame = null;
        const batch = this.strokeBatch;
        this.strokeBatch = [];
        if (batch.length) this.enqueue({ type: 'strokes', data: batch });
      });
    }
  }

  flushStrokes() {
    if (this.disposed) return;
    if (this.strokeFrame !== null) this.scheduler.cancel(this.strokeFrame);
    this.strokeFrame = null;
    const batch = this.strokeBatch;
    this.strokeBatch = [];
    if (batch.length) this.enqueue({ type: 'strokes', data: batch });
  }

  setViewport(size: CanvasSize, state: CanvasViewportState) {
    if (this.disposed) return;
    this.viewport = { size, state };
    if (this.viewportFrame !== null) return;
    this.viewportFrame = this.scheduler.frame(() => {
      this.viewportFrame = null;
      if (this.viewport)
        this.enqueue(createRendererViewportMessage(this.viewport.size, this.viewport.state));
    });
  }

  clear() {
    this.enqueue({ type: 'clear' });
  }

  /** Delivers a retained-renderer command while keeping transport ownership here. */
  send(message: PresentationCommand) {
    this.enqueue(message);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.strokeFrame !== null) this.scheduler.cancel(this.strokeFrame);
    if (this.viewportFrame !== null) this.scheduler.cancel(this.viewportFrame);
    this.strokeFrame = null;
    this.viewportFrame = null;
    this.pending.length = 0;
    this.strokeBatch = [];
    this.adapter.dispose?.();
  }

  private enqueue(message: PresentationCommand) {
    if (this.disposed) return;
    this.pending.push(message);
    this.flush();
  }

  private flush() {
    if (!this.ready) return;
    while (this.pending.length) this.adapter.send(this.pending.shift()!);
  }
}
