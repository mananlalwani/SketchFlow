import { logger } from '../utils/logger.js';
export class DrawingService {
    connections = new Set();
    currentSnapshot = null;
    strokes = [];
    shapes = [];
    maxConnections = 50; // Reduced for better performance
    maxStrokes = 5000; // Reduced memory usage
    maxShapes = 1000; // Limit for shapes
    snapshotThrottleTimeout = null;
    snapshotThrottleMs = 200; // Increased throttling for CPU efficiency
    addConnection(clientId) {
        if (this.connections.size >= this.maxConnections) {
            logger.warn(`Max connections reached, rejecting ${clientId}`);
            return;
        }
        this.connections.add(clientId);
        logger.debug(`Connection added: ${clientId}, total: ${this.connections.size}`);
    }
    removeConnection(clientId) {
        this.connections.delete(clientId);
        logger.debug(`Connection removed: ${clientId}, total: ${this.connections.size}`);
    }
    getConnectionCount() {
        return this.connections.size;
    }
    getMaxConnections() {
        return this.maxConnections;
    }
    addStroke(stroke) {
        this.strokes.push(stroke);
        // Keep stroke history manageable
        if (this.strokes.length > this.maxStrokes) {
            this.strokes = this.strokes.slice(-this.maxStrokes * 0.8); // Keep 80% of max
            logger.debug(`Stroke history trimmed to ${this.strokes.length} strokes`);
        }
    }
    addStrokes(strokes) {
        this.strokes.push(...strokes);
        if (this.strokes.length > this.maxStrokes) {
            this.strokes = this.strokes.slice(-this.maxStrokes * 0.8);
            logger.debug(`Stroke history trimmed to ${this.strokes.length} strokes`);
        }
    }
    addShape(shape) {
        this.shapes.push(shape);
        // No special handling needed; text is just another shape type
        // Keep shape history manageable
        if (this.shapes.length > this.maxShapes) {
            this.shapes = this.shapes.slice(-this.maxShapes * 0.8); // Keep 80% of max
            logger.debug(`Shape history trimmed to ${this.shapes.length} shapes`);
        }
    }
    getCurrentSnapshot() {
        return this.currentSnapshot;
    }
    updateSnapshot(snapshot) {
        this.currentSnapshot = snapshot;
        logger.debug('Canvas snapshot updated');
    }
    broadcastSnapshotThrottled(callback) {
        if (this.snapshotThrottleTimeout)
            return;
        this.snapshotThrottleTimeout = setTimeout(() => {
            callback();
            this.snapshotThrottleTimeout = null;
        }, this.snapshotThrottleMs);
    }
    clearCanvas() {
        this.strokes = [];
        this.shapes = [];
        this.currentSnapshot = null;
        logger.info('Canvas cleared');
    }
    getStats() {
        return {
            connections: this.connections.size,
            strokes: this.strokes.length,
            shapes: this.shapes.length,
            hasSnapshot: !!this.currentSnapshot,
            snapshotSize: this.currentSnapshot?.dataUrl?.length || 0
        };
    }
}
//# sourceMappingURL=DrawingService.js.map