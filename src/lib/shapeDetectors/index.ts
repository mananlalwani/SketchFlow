/**
 * Shape Detection System
 * 
 * A modern, modular shape detection system for 2D sketches
 */

// Main pipeline
export { ShapeDetectionPipeline } from './ShapeDetectionPipeline';
export type { ShapeDetectionResult, DetectionOptions } from './ShapeDetectionPipeline';

// Types
export type { 
  DetectionResult, 
  DetectedShape, 
  ShapeDetector, 
  DetectionThresholds 
} from './types';
export { DEFAULT_THRESHOLDS, createDetectedShape } from './types';

// Individual detectors
export { LineDetector } from './LineDetector';
export { RectangleDetector } from './RectangleDetector';
export { EllipseDetector } from './EllipseDetector';
export { TriangleDetector } from './TriangleDetector';
export { ParabolaDetector } from './ParabolaDetector';
export { ArrowDetector } from './ArrowDetector';
export { StarDetector } from './StarDetector';

// Convenience function for quick shape detection
import { ShapeDetectionPipeline } from './ShapeDetectionPipeline';
import type { Point } from '../geometry';
import type { DetectionOptions, ShapeDetectionResult } from './ShapeDetectionPipeline';

let defaultPipeline: ShapeDetectionPipeline | null = null;

/**
 * Detect shapes from a stroke using the default pipeline
 */
export function detectShapes(
  points: Point[], 
  options: DetectionOptions = {}
): ShapeDetectionResult {
  if (!defaultPipeline) {
    defaultPipeline = new ShapeDetectionPipeline();
  }
  
  return defaultPipeline.detectShape(points, options);
}

/**
 * Create a new detection pipeline with custom configuration
 */
export function createDetectionPipeline(options: DetectionOptions = {}): ShapeDetectionPipeline {
  return new ShapeDetectionPipeline(options);
}

/**
 * Reset the default pipeline (useful for testing or configuration changes)
 */
export function resetDefaultPipeline(): void {
  defaultPipeline = null;
}





