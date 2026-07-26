import { describe, expect, it } from 'vitest';
import { createDetectionPipeline, detectShapes, resetDefaultPipeline } from '@/lib/shapeDetectors';
import type { Point } from '@/lib/geometry';

const horizontalStroke: Point[] = Array.from({ length: 13 }, (_, index) => ({
  x: index * 10,
  // Keep both bounding-box dimensions above the preprocessing minimum while
  // remaining straight enough to be recognized as a line.
  y: 40 + index * 2,
}));

function closedPolygon(vertices: Point[], pointsPerEdge = 8): Point[] {
  return vertices
    .flatMap((start, index) => {
      const end = vertices[(index + 1) % vertices.length];
      return Array.from({ length: pointsPerEdge }, (_, step) => {
        const ratio = step / pointsPerEdge;
        return { x: start.x + (end.x - start.x) * ratio, y: start.y + (end.y - start.y) * ratio };
      });
    })
    .concat(vertices[0]);
}

const ellipseStroke: Point[] = Array.from({ length: 49 }, (_, index) => {
  const angle = (index / 48) * Math.PI * 2;
  return { x: 100 + Math.cos(angle) * 60, y: 100 + Math.sin(angle) * 35 };
});

describe('shape detection pipeline', () => {
  it('returns no candidate for an empty stroke', () => {
    const result = detectShapes([]);

    expect(result.detectedShape).toBeNull();
    expect(result.allCandidates).toEqual([]);
    expect(result.processedStroke.totalLength).toBe(0);
  });

  it('recognizes a straight pen stroke as a line', () => {
    const pipeline = createDetectionPipeline({ enabledDetectors: ['line'] });
    const result = pipeline.detectShape(horizontalStroke, { returnAllCandidates: true });

    expect(result.detectedShape?.shape.type).toBe('line');
    expect(result.detectedShape?.confidence).toBeGreaterThanOrEqual(0.6);
    expect(result.allCandidates).toHaveLength(1);
  });

  it('recognizes closed rectangles and keeps the editable corner points', () => {
    const result = detectShapes(
      closedPolygon([
        { x: 20, y: 20 },
        { x: 160, y: 20 },
        { x: 160, y: 90 },
        { x: 20, y: 90 },
      ]),
      { enabledDetectors: ['rectangle'] },
    );

    expect(result.detectedShape?.shape.type).toBe('rectangle');
    expect(result.detectedShape?.shape.points).toHaveLength(4);
  });

  it('distinguishes triangles from rectangles', () => {
    const result = detectShapes(
      closedPolygon([
        { x: 40, y: 140 },
        { x: 100, y: 20 },
        { x: 160, y: 140 },
      ]),
      { enabledDetectors: ['triangle'] },
    );

    expect(result.detectedShape?.shape.type).toBe('triangle');
    expect(result.detectedShape?.shape.points).toHaveLength(3);
  });

  it('classifies a closed radial stroke as an ellipse', () => {
    const result = detectShapes(ellipseStroke, { enabledDetectors: ['ellipse', 'circle'] });

    expect(result.detectedShape?.shape.type).toBe('ellipse');
    expect(result.detectedShape?.error).toBeLessThan(0.1);
  });

  it('honors enabled-detector filtering and keeps its default pipeline resettable', () => {
    resetDefaultPipeline();
    const pipeline = createDetectionPipeline({ enabledDetectors: ['triangle'] });
    const result = pipeline.detectShape(horizontalStroke, { returnAllCandidates: true });

    expect(result.detectedShape).toBeNull();
    expect(result.allCandidates).toEqual([]);

    resetDefaultPipeline();
  });
});
