/**
 * Shape Detection System
 *
 * A modern, modular shape detection system for 2D sketches
 */

// Main pipeline
export { DrawingDetectionPipeline } from './ShapeDetectionPipeline';
export type { DrawingDetectionResult, DetectionOptions } from './ShapeDetectionPipeline';

// Types
export type {
  DetectionResult,
  DetectedDrawing,
  DrawingDetector,
  DetectionThresholds,
} from './types';
export { DEFAULT_THRESHOLDS, createDetectedDrawing } from './types';

// Convenience function for quick shape detection
import { DrawingDetectionPipeline } from './ShapeDetectionPipeline';
import type { Point } from '../geometry';
import type { DetectionOptions, DrawingDetectionResult } from './ShapeDetectionPipeline';

let defaultPipeline: DrawingDetectionPipeline | null = null;

/**
 * Detect shapes from a stroke using the default pipeline
 */
export function detectDrawings(
  points: Point[],
  options: DetectionOptions = {},
): DrawingDetectionResult {
  if (!defaultPipeline) {
    defaultPipeline = new DrawingDetectionPipeline();
  }

  return defaultPipeline.detectDrawing(points, options);
}

/**
 * Create a new detection pipeline with custom configuration
 */
export function createDetectionPipeline(options: DetectionOptions = {}): DrawingDetectionPipeline {
  return new DrawingDetectionPipeline(options);
}

/**
 * Reset the default pipeline (useful for testing or configuration changes)
 */
export function resetDefaultPipeline(): void {
  defaultPipeline = null;
}
