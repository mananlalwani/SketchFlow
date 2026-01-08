import type { StrokeData, ShapeData, CanvasSnapshot } from '../types/socket.js';
export declare class DrawingService {
    private connections;
    private currentSnapshot;
    private strokes;
    private shapes;
    private readonly maxConnections;
    private readonly maxStrokes;
    private readonly maxShapes;
    private snapshotThrottleTimeout;
    private readonly snapshotThrottleMs;
    addConnection(clientId: string): void;
    removeConnection(clientId: string): void;
    getConnectionCount(): number;
    getMaxConnections(): number;
    addStroke(stroke: StrokeData): void;
    addStrokes(strokes: StrokeData[]): void;
    addShape(shape: ShapeData): void;
    getCurrentSnapshot(): CanvasSnapshot | null;
    updateSnapshot(snapshot: CanvasSnapshot): void;
    broadcastSnapshotThrottled(callback: () => void): void;
    clearCanvas(): void;
    getStats(): {
        connections: number;
        strokes: number;
        shapes: number;
        hasSnapshot: boolean;
        snapshotSize: number;
    };
}
//# sourceMappingURL=DrawingService.d.ts.map