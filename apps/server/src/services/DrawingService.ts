import type { StrokeData, ShapeData, CanvasSnapshot } from '../types/socket.js';
import { logger } from '../utils/logger.js';

interface CanvasState {
  currentSnapshot: CanvasSnapshot | null;
  strokes: StrokeData[];
  shapes: ShapeData[];
  snapshotThrottleTimeout: NodeJS.Timeout | null;
  lastActivityAt: number;
}

/**
 * Ephemeral collaboration state. Durable project data remains in PostgreSQL;
 * this cache is deliberately keyed by project so rooms cannot share state.
 */
export class DrawingService {
  private connections = new Set<string>();
  private canvases = new Map<string, CanvasState>();
  private readonly maxConnections = 50;
  private readonly maxStrokes = 5000;
  private readonly maxShapes = 1000;
  private readonly snapshotThrottleMs = 200;

  private canvas(projectId: string): CanvasState {
    let canvas = this.canvases.get(projectId);
    if (!canvas) {
      canvas = {
        currentSnapshot: null,
        strokes: [],
        shapes: [],
        snapshotThrottleTimeout: null,
        lastActivityAt: Date.now(),
      };
      this.canvases.set(projectId, canvas);
    }
    return canvas;
  }

  public addConnection(clientId: string): boolean {
    if (this.connections.size >= this.maxConnections) {
      logger.warn(`Max connections reached, rejecting ${clientId}`);
      return false;
    }
    this.connections.add(clientId);
    return true;
  }

  public removeConnection(clientId: string): void {
    this.connections.delete(clientId);
  }
  public getConnectionCount(): number {
    return this.connections.size;
  }
  public getMaxConnections(): number {
    return this.maxConnections;
  }

  public addStroke(projectId: string, stroke: StrokeData): void {
    const canvas = this.canvas(projectId);
    canvas.lastActivityAt = Date.now();
    canvas.strokes.push(stroke);
    if (canvas.strokes.length > this.maxStrokes)
      canvas.strokes = canvas.strokes.slice(-this.maxStrokes * 0.8);
  }

  public addStrokes(projectId: string, strokes: StrokeData[]): void {
    const canvas = this.canvas(projectId);
    canvas.lastActivityAt = Date.now();
    canvas.strokes.push(...strokes);
    if (canvas.strokes.length > this.maxStrokes)
      canvas.strokes = canvas.strokes.slice(-this.maxStrokes * 0.8);
  }

  public addShape(projectId: string, shape: ShapeData): void {
    const canvas = this.canvas(projectId);
    canvas.lastActivityAt = Date.now();
    canvas.shapes.push(shape);
    if (canvas.shapes.length > this.maxShapes)
      canvas.shapes = canvas.shapes.slice(-this.maxShapes * 0.8);
  }

  public getCurrentSnapshot(projectId: string): CanvasSnapshot | null {
    return this.canvas(projectId).currentSnapshot;
  }
  public updateSnapshot(projectId: string, snapshot: CanvasSnapshot): void {
    const canvas = this.canvas(projectId);
    canvas.currentSnapshot = snapshot;
    canvas.lastActivityAt = Date.now();
  }

  public cleanupInactiveCanvases(maxIdleMs: number, now = Date.now()): number {
    let removed = 0;
    for (const [projectId, canvas] of this.canvases) {
      if (canvas.lastActivityAt + maxIdleMs >= now) continue;
      if (canvas.snapshotThrottleTimeout) clearTimeout(canvas.snapshotThrottleTimeout);
      this.canvases.delete(projectId);
      removed++;
    }
    return removed;
  }

  public broadcastSnapshotThrottled(projectId: string, callback: () => void): void {
    const canvas = this.canvas(projectId);
    if (canvas.snapshotThrottleTimeout) return;
    canvas.snapshotThrottleTimeout = setTimeout(() => {
      callback();
      canvas.snapshotThrottleTimeout = null;
    }, this.snapshotThrottleMs);
  }

  public clearCanvas(projectId: string): void {
    const canvas = this.canvas(projectId);
    canvas.lastActivityAt = Date.now();
    canvas.strokes = [];
    canvas.shapes = [];
    canvas.currentSnapshot = null;
  }

  public getStats(projectId?: string) {
    const canvas = projectId ? this.canvas(projectId) : undefined;
    return {
      connections: this.connections.size,
      projects: this.canvases.size,
      strokes: canvas?.strokes.length ?? 0,
      shapes: canvas?.shapes.length ?? 0,
      hasSnapshot: !!canvas?.currentSnapshot,
      snapshotSize: canvas?.currentSnapshot?.dataUrl.length ?? 0,
    };
  }
}
