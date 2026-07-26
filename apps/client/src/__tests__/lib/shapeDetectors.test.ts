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

const circleStroke: Point[] = Array.from({ length: 49 }, (_, index) => {
  const angle = (index / 48) * Math.PI * 2;
  return { x: 100 + Math.cos(angle) * 55, y: 100 + Math.sin(angle) * 55 };
});

const parabolaStroke: Point[] = Array.from({ length: 25 }, (_, index) => {
  const x = index * 8;
  return { x, y: 30 + (x - 96) ** 2 / 150 };
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

  it('accepts a lightly jittered rectangle instead of requiring perfect pointer samples', () => {
    const points = closedPolygon([
      { x: 20, y: 20 },
      { x: 160, y: 20 },
      { x: 160, y: 90 },
      { x: 20, y: 90 },
    ]).map((point, index) => ({
      x: point.x + (index % 3 === 0 ? 1.5 : -0.8),
      y: point.y + (index % 4 === 0 ? -1.2 : 0.6),
    }));
    points[points.length - 1] = points[0];

    expect(
      detectShapes(points, { enabledDetectors: ['rectangle'] }).detectedShape?.shape.type,
    ).toBe('rectangle');
  });

  it('recognizes rectangles with the same processing settings used by the canvas', () => {
    const result = detectShapes(
      closedPolygon([
        { x: 20, y: 20 },
        { x: 160, y: 20 },
        { x: 160, y: 90 },
        { x: 20, y: 90 },
      ]),
      {
        strokeProcessingOptions: {
          minSize: 15,
          resampleStep: 2,
          closureTolerance: 0.15,
          simplificationTolerance: 0.5,
          smoothingWindow: 3,
        },
      },
    );

    expect(result.detectedShape?.shape.type).toBe('rectangle');
  });

  it('fits a rectangle with rounded, uneven hand-drawn corners', () => {
    const roughRectangle: Point[] = [
      { x: 26, y: 22 },
      { x: 55, y: 18 },
      { x: 124, y: 22 },
      { x: 153, y: 28 },
      { x: 161, y: 48 },
      { x: 158, y: 96 },
      { x: 150, y: 108 },
      { x: 112, y: 111 },
      { x: 48, y: 107 },
      { x: 25, y: 100 },
      { x: 18, y: 81 },
      { x: 21, y: 43 },
      { x: 26, y: 22 },
    ];

    const result = detectShapes(roughRectangle, {
      strokeProcessingOptions: { minSize: 15, resampleStep: 2, simplificationTolerance: 0.5 },
    });

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

  it('distinguishes circles from ellipses using their axis ratio', () => {
    const result = detectShapes(circleStroke, { enabledDetectors: ['ellipse', 'circle'] });

    expect(result.detectedShape?.shape.type).toBe('circle');
  });

  it('fits an open quadratic stroke and exposes its editable orientation', () => {
    const result = detectShapes(parabolaStroke, { enabledDetectors: ['parabola'] });

    expect(result.detectedShape?.shape.type).toBe('parabola');
    expect(result.detectedShape?.shape.properties?.orientation).toBe('down');
    expect(result.detectedShape?.error).toBeLessThan(0.05);
  });

  it('does not convert a jagged freehand stroke into a supported shape', () => {
    const scribble: Point[] = [
      { x: 0, y: 0 },
      { x: 40, y: 50 },
      { x: 10, y: 110 },
      { x: 95, y: 80 },
      { x: 45, y: 170 },
      { x: 150, y: 125 },
    ];

    expect(detectShapes(scribble).detectedShape).toBeNull();
  });

  it('returns candidates only when requested so normal drawing stays lightweight', () => {
    const pipeline = createDetectionPipeline({ enabledDetectors: ['line'] });

    expect(pipeline.detectShape(horizontalStroke).allCandidates).toEqual([]);
    expect(
      pipeline.detectShape(horizontalStroke, { returnAllCandidates: true }).allCandidates,
    ).toHaveLength(1);
  });

  it('honors a caller confidence threshold before converting a stroke', () => {
    const result = detectShapes(horizontalStroke, {
      enabledDetectors: ['line'],
      thresholds: { minConfidence: 1.01 },
    });

    expect(result.detectedShape).toBeNull();
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
