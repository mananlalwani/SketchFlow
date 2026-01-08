import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DrawingService } from '../../services/DrawingService.js';
// Mock the logger
vi.mock('../../utils/logger.js', () => ({
    logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));
describe('DrawingService', () => {
    let service;
    beforeEach(() => {
        service = new DrawingService();
    });
    describe('connections', () => {
        it('should add a connection', () => {
            service.addConnection('client-1');
            expect(service.getConnectionCount()).toBe(1);
        });
        it('should remove a connection', () => {
            service.addConnection('client-1');
            service.addConnection('client-2');
            service.removeConnection('client-1');
            expect(service.getConnectionCount()).toBe(1);
        });
        it('should not exceed max connections', () => {
            const max = service.getMaxConnections();
            for (let i = 0; i < max + 5; i++) {
                service.addConnection(`client-${i}`);
            }
            expect(service.getConnectionCount()).toBe(max);
        });
        it('should handle removing non-existent connection', () => {
            service.addConnection('client-1');
            service.removeConnection('client-nonexistent');
            expect(service.getConnectionCount()).toBe(1);
        });
    });
    describe('strokes', () => {
        it('should add a stroke', () => {
            const stroke = {
                x0: 0, y0: 0, x1: 10, y1: 10,
                color: '#ffffff', size: 5
            };
            service.addStroke(stroke);
            expect(service.getStats().strokes).toBe(1);
        });
        it('should add multiple strokes', () => {
            const strokes = [
                { x0: 0, y0: 0, x1: 10, y1: 10, color: '#ffffff', size: 5 },
                { x0: 10, y0: 10, x1: 20, y1: 20, color: '#000000', size: 3 },
            ];
            service.addStrokes(strokes);
            expect(service.getStats().strokes).toBe(2);
        });
        it('should trim strokes when exceeding max', () => {
            // Add many strokes to trigger trimming
            for (let i = 0; i < 6000; i++) {
                service.addStroke({
                    x0: i, y0: i, x1: i + 1, y1: i + 1,
                    color: '#ffffff', size: 1
                });
            }
            // Should be trimmed to 80% of max (5000 * 0.8 = 4000)
            expect(service.getStats().strokes).toBeLessThanOrEqual(5000);
        });
    });
    describe('shapes', () => {
        it('should add a shape', () => {
            const shape = {
                id: 'shape-1',
                type: 'rectangle',
                x: 0, y: 0, width: 100, height: 50,
                color: '#ff0000', size: 2, alpha: 1
            };
            service.addShape(shape);
            expect(service.getStats().shapes).toBe(1);
        });
    });
    describe('snapshot', () => {
        it('should update and retrieve snapshot', () => {
            expect(service.getCurrentSnapshot()).toBeNull();
            const snapshot = { dataUrl: 'data:image/png;base64,abc123' };
            service.updateSnapshot(snapshot);
            expect(service.getCurrentSnapshot()).toEqual(snapshot);
        });
    });
    describe('clearCanvas', () => {
        it('should clear all data', () => {
            service.addStroke({ x0: 0, y0: 0, x1: 1, y1: 1, color: '#fff', size: 1 });
            service.addShape({
                id: 's1', type: 'ellipse', x: 0, y: 0,
                width: 10, height: 10, color: '#000', size: 1, alpha: 1
            });
            service.updateSnapshot({ dataUrl: 'data:image/png;base64,test' });
            service.clearCanvas();
            const stats = service.getStats();
            expect(stats.strokes).toBe(0);
            expect(stats.shapes).toBe(0);
            expect(stats.hasSnapshot).toBe(false);
        });
    });
    describe('getStats', () => {
        it('should return correct stats', () => {
            service.addConnection('c1');
            service.addStroke({ x0: 0, y0: 0, x1: 1, y1: 1, color: '#fff', size: 1 });
            service.addShape({
                id: 's1', type: 'line', x: 0, y: 0,
                width: 10, height: 0, color: '#000', size: 1, alpha: 1
            });
            const stats = service.getStats();
            expect(stats.connections).toBe(1);
            expect(stats.strokes).toBe(1);
            expect(stats.shapes).toBe(1);
            expect(stats.hasSnapshot).toBe(false);
            expect(stats.snapshotSize).toBe(0);
        });
    });
});
//# sourceMappingURL=DrawingService.test.js.map