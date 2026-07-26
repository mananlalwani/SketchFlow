import { describe, expect, it } from 'vitest';
import {
  createDetectionPipeline,
  detectShapes,
  resetDefaultPipeline,
} from '@/lib/shapeDetectors';
import type { Point } from '@/lib/geometry';

const horizontalStroke: Point[] = Array.from({ length: 13 }, (_, index) => ({
  x: index * 10,
  // Keep both bounding-box dimensions above the preprocessing minimum while
  // remaining straight enough to be recognized as a line.
  y: 40 + index * 2,
}));

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

  it('honors enabled-detector filtering and keeps its default pipeline resettable', () => {
    resetDefaultPipeline();
    const pipeline = createDetectionPipeline({ enabledDetectors: ['triangle'] });
    const result = pipeline.detectShape(horizontalStroke, { returnAllCandidates: true });

    expect(result.detectedShape).toBeNull();
    expect(result.allCandidates).toEqual([]);

    resetDefaultPipeline();
  });
});
