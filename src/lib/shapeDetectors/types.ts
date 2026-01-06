/**
 * Common types for shape detection
 */

import { Point, BoundingBox } from '../geometry';
import { ProcessedStroke } from '../strokeProcessor';

export interface DetectionResult {
  confidence: number; // 0-1, higher = more confident
  shape: DetectedShape;
  error: number; // Average fitting error
  metadata?: Record<string, any>;
}

export interface DetectedShape {
  type: 'line' | 'rectangle' | 'ellipse' | 'circle' | 'triangle' | 'parabola' | 'arrow' | 'star';
  boundingBox: BoundingBox;
  points?: Point[]; // Key points (e.g., triangle vertices, line endpoints)
  center?: Point;
  orientation?: number; // Rotation angle in radians
  filled?: boolean;
  properties?: Record<string, any>; // Shape-specific properties
}

export interface ShapeDetector {
  detect(stroke: ProcessedStroke, thresholds: DetectionThresholds): DetectionResult | null;
  readonly shapeType: string;
  readonly priority: number; // Higher priority shapes are tested first
}

export interface DetectionThresholds {
  // General thresholds
  minConfidence: number;
  maxError: number;
  
  // Line detection
  lineAngleTolerance: number; // radians
  lineMaxError: number;
  lineMinLength: number;
  lineMinStraightness: number;
  lineMaxComplexity: number;
  lineMinStraightSegmentRatio: number;
  
  // Rectangle detection
  rectangleCornerTolerance: number; // radians
  rectangleEdgeRatio: number; // minimum ratio of points on edges
  rectangleMaxError: number;
  rectangleAspectRatioTolerance: number;
  
  // Ellipse/Circle detection
  ellipseMaxError: number;
  circleRoundnessTolerance: number;
  ellipseMinEccentricity: number;
  
  // Triangle detection
  triangleCornerTolerance: number;
  triangleEdgeRatio: number;
  triangleMaxError: number;
  
  // Parabola detection
  parabolaMaxError: number;
  parabolaMinCurvature: number;
  parabolaSymmetryTolerance: number;
}

export const DEFAULT_THRESHOLDS: DetectionThresholds = {
  minConfidence: 0.6,
  maxError: 0.3,
  
  lineAngleTolerance: Math.PI / 12, // 15 degrees
  lineMaxError: 0.15,
  lineMinLength: 20,
  lineMinStraightness: 0.8,
  lineMaxComplexity: 0.18,
  lineMinStraightSegmentRatio: 0.7,
  
  rectangleCornerTolerance: Math.PI / 6, // 30 degrees
  rectangleEdgeRatio: 0.65,
  rectangleMaxError: 0.25,
  rectangleAspectRatioTolerance: 0.2,
  
  ellipseMaxError: 0.3,
  circleRoundnessTolerance: 0.2,
  ellipseMinEccentricity: 0.1,
  
  triangleCornerTolerance: Math.PI / 4, // 45 degrees
  triangleEdgeRatio: 0.7,
  triangleMaxError: 0.2,
  
  parabolaMaxError: 0.3,
  parabolaMinCurvature: 0.08, // Reduced from 1.0 - complexity is typically 0-0.5
  parabolaSymmetryTolerance: 0.25 // Slightly relaxed for hand-drawn curves
};

// Helper function to create a DetectedShape
export function createDetectedShape(
  type: DetectedShape['type'],
  boundingBox: BoundingBox,
  options: Partial<Omit<DetectedShape, 'type' | 'boundingBox'>> = {}
): DetectedShape {
  return {
    type,
    boundingBox,
    center: options.center || {
      x: boundingBox.centerX,
      y: boundingBox.centerY
    },
    ...options
  };
}


