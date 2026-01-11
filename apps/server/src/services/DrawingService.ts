import type { StrokeData, ShapeData, CanvasSnapshot } from '../types/socket.js';
import { logger } from '../utils/logger.js';

export class DrawingService {
  private connections = new Set<string>();
  private currentSnapshot: CanvasSnapshot | null = null;
  private strokes: StrokeData[] = [];
  private shapes: ShapeData[] = [];
  private readonly maxConnections = 50; // Reduced for better performance
  private readonly maxStrokes = 5000; // Reduced memory usage
  private readonly maxShapes = 1000; // Limit for shapes
  private snapshotThrottleTimeout: NodeJS.Timeout | null = null;
  private readonly snapshotThrottleMs = 200; // Increased throttling for CPU efficiency

  public addConnection(clientId: string): void {
    if (this.connections.size >= this.maxConnections) {
      logger.warn(`Max connections reached, rejecting ${clientId}`);
      return;
    }
    
    this.connections.add(clientId);
    logger.debug(`Connection added: ${clientId}, total: ${this.connections.size}`);
  }

  public removeConnection(clientId: string): void {
    this.connections.delete(clientId);
    logger.debug(`Connection removed: ${clientId}, total: ${this.connections.size}`);
  }

  public getConnectionCount(): number {
    return this.connections.size;
  }

  public getMaxConnections(): number {
    return this.maxConnections;
  }

  public addStroke(stroke: StrokeData): void {
    this.strokes.push(stroke);
    
    // Keep stroke history manageable
    if (this.strokes.length > this.maxStrokes) {
      this.strokes = this.strokes.slice(-this.maxStrokes * 0.8); // Keep 80% of max
      logger.debug(`Stroke history trimmed to ${this.strokes.length} strokes`);
    }
  }

  public addStrokes(strokes: StrokeData[]): void {
    this.strokes.push(...strokes);
    
    if (this.strokes.length > this.maxStrokes) {
      this.strokes = this.strokes.slice(-this.maxStrokes * 0.8);
      logger.debug(`Stroke history trimmed to ${this.strokes.length} strokes`);
    }
  }

  public addShape(shape: ShapeData): void {
    this.shapes.push(shape);
    // No special handling needed; text is just another shape type
    
    // Keep shape history manageable
    if (this.shapes.length > this.maxShapes) {
      this.shapes = this.shapes.slice(-this.maxShapes * 0.8); // Keep 80% of max
      logger.debug(`Shape history trimmed to ${this.shapes.length} shapes`);
    }
  }

  public getCurrentSnapshot(): CanvasSnapshot | null {
    return this.currentSnapshot;
  }

  public updateSnapshot(snapshot: CanvasSnapshot): void {
    this.currentSnapshot = snapshot;
    logger.debug('Canvas snapshot updated');
  }

  public broadcastSnapshotThrottled(callback: () => void): void {
    if (this.snapshotThrottleTimeout) return;
    
    this.snapshotThrottleTimeout = setTimeout(() => {
      callback();
      this.snapshotThrottleTimeout = null;
    }, this.snapshotThrottleMs);
  }

  public clearCanvas(): void {
    this.strokes = [];
    this.shapes = [];
    this.currentSnapshot = null;
    logger.info('Canvas cleared');
  }

  public getStats() {
    return {
      connections: this.connections.size,
      strokes: this.strokes.length,
      shapes: this.shapes.length,
      hasSnapshot: !!this.currentSnapshot,
      snapshotSize: this.currentSnapshot?.dataUrl?.length || 0
    };
  }
}
