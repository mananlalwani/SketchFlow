export { DrawingDetectionPipeline } from './ShapeDetectionPipeline';
export type { DrawingDetectionResult, DetectionOptions } from './ShapeDetectionPipeline';

export type {
  DetectionResult,
  DetectedDrawing,
  DrawingDetector,
  DetectionThresholds,
} from './types';
export { DEFAULT_THRESHOLDS, createDetectedDrawing } from './types';

import { DrawingDetectionPipeline } from './ShapeDetectionPipeline';
import type { Point } from '../geometry';
import type { DetectionOptions, DrawingDetectionResult } from './ShapeDetectionPipeline';

let defaultPipeline: DrawingDetectionPipeline | null = null;

export function detectDrawings(
  points: Point[],
  options: DetectionOptions = {},
): DrawingDetectionResult {
  if (!defaultPipeline) {
    defaultPipeline = new DrawingDetectionPipeline();
  }

  return defaultPipeline.detectDrawing(points, options);
}

export function createDetectionPipeline(options: DetectionOptions = {}): DrawingDetectionPipeline {
  return new DrawingDetectionPipeline(options);
}

export function resetDefaultPipeline(): void {
  defaultPipeline = null;
}
