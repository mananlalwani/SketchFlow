/**
 * Ellipse and Circle detection algorithm
 */

import { Point, BoundingBox } from '../geometry';
import { ProcessedStroke, analyzeStroke } from '../strokeProcessor';
import { ShapeDetector, DetectionResult, DetectionThresholds, createDetectedShape } from './types';

export class EllipseDetector implements ShapeDetector {
  readonly shapeType = 'ellipse';
  readonly priority = 3;

  detect(stroke: ProcessedStroke, thresholds: DetectionThresholds): DetectionResult | null {
    const points = stroke.processedPoints;
    
    // Quick rejection tests
    if (points.length < 8) {
      console.log(`Ellipse: REJECT - too few points: ${points.length} < 8`);
      return null;
    }
    if (!stroke.isClosed) {
      console.log(`Ellipse: REJECT - not closed`);
      return null; // Ellipses should be closed
    }
    
    const analysis = analyzeStroke(stroke);
    console.log(`Ellipse: Analysis - corners: ${analysis.cornerCount}, hasSharp: ${analysis.hasSharpCorners}, direction: ${analysis.dominantDirection}, symmetry: ${analysis.symmetry.toFixed(3)}, straightRatio: ${analysis.straightSegmentRatio.toFixed(3)}`);
    
    // Reject shapes with too many straight segments - ellipses should be curved
    if (analysis.straightSegmentRatio > 0.5) {
      console.log(`Ellipse: REJECT - too many straight segments: ${analysis.straightSegmentRatio.toFixed(3)} > 0.5 (likely a polygon)`);
      return null;
    }
    
    // Be more flexible about shape characteristics
    if (!stroke.isSmooth && analysis.dominantDirection !== 'circular' && analysis.symmetry < 0.4) {
      console.log(`Ellipse: REJECT - rough (${stroke.isSmooth}) AND not circular (${analysis.dominantDirection}) AND low symmetry (${analysis.symmetry.toFixed(3)})`);
      return null; // Only reject if it's rough AND not circular AND not symmetric
    }
    
    // Allow some corners for hand-drawn ellipses - be very tolerant for smooth strokes
    // If symmetry is high, allow more corners (discretization artifacts)
    const maxAllowedCorners = stroke.isSmooth && analysis.symmetry > 0.6 ? 40 : stroke.isSmooth ? 15 : 4;
    if (analysis.hasSharpCorners && analysis.cornerCount > maxAllowedCorners) {
      console.log(`Ellipse: REJECT - too many corners: ${analysis.cornerCount} > ${maxAllowedCorners} (smooth: ${stroke.isSmooth})`);
      return null;
    }
    
    // Fit ellipse to the points
    const ellipseFit = this.fitEllipse(points, stroke.boundingBox);
    if (!ellipseFit) {
      console.log(`Ellipse: REJECT - ellipse fitting failed`);
      return null;
    }
    
    // Calculate fitting error
    const error = this.calculateEllipseError(points, ellipseFit);
    const normalizedError = error / Math.max(stroke.boundingBox.width, stroke.boundingBox.height);
    
    if (normalizedError > thresholds.ellipseMaxError) {
      console.log(`Ellipse: REJECT - error too high: ${normalizedError.toFixed(3)} > ${thresholds.ellipseMaxError}`);
      return null;
    }
    
    // Determine if it's more of a circle
    const isCircle = this.isCircular(ellipseFit, thresholds.circleRoundnessTolerance);
    const shapeType = isCircle ? 'circle' : 'ellipse';
    
    console.log(`Ellipse: Shape determination - radiusX=${ellipseFit.radiusX.toFixed(1)}, radiusY=${ellipseFit.radiusY.toFixed(1)}, eccentricity=${ellipseFit.eccentricity.toFixed(3)}, isCircle=${isCircle}`);
    
    // Check eccentricity for ellipse
    if (!isCircle && ellipseFit.eccentricity < thresholds.ellipseMinEccentricity) {
      console.log(`Ellipse: REJECT - too close to circle: eccentricity ${ellipseFit.eccentricity.toFixed(3)} < ${thresholds.ellipseMinEccentricity}`);
      return null; // Too close to a circle, should be detected as circle instead
    }
    
    // Calculate confidence
    const smoothnessConfidence = stroke.isSmooth ? 1 : 0.5;
    const circularConfidence = analysis.dominantDirection === 'circular' ? 1 : analysis.symmetry;
    const errorConfidence = 1 - Math.min(1, normalizedError / thresholds.ellipseMaxError);
    const closureConfidence = stroke.isClosed ? 1 : 0.5;
    
    // Penalize if aspect ratio suggests this might be another shape
    const aspectRatio = Math.max(ellipseFit.radiusX, ellipseFit.radiusY) / Math.min(ellipseFit.radiusX, ellipseFit.radiusY);
    const aspectConfidence = isCircle ? 1 : Math.max(0.3, 1 - (aspectRatio - 1) / 3); // Reduce confidence for very elongated ellipses
    
    const confidence = (smoothnessConfidence + circularConfidence + errorConfidence + closureConfidence + aspectConfidence) / 5;
    
    if (confidence < thresholds.minConfidence) {
      console.log(`Ellipse: REJECT - low confidence: ${confidence.toFixed(3)} < ${thresholds.minConfidence}`);
      return null;
    }
    
    console.log(`Ellipse: SUCCESS - ${shapeType} detected with confidence ${confidence.toFixed(3)}, error ${normalizedError.toFixed(3)}`);
    
    // Create the detected shape
    const shape = createDetectedShape(shapeType as 'ellipse' | 'circle', stroke.boundingBox, {
      center: ellipseFit.center,
      properties: {
        radiusX: ellipseFit.radiusX,
        radiusY: ellipseFit.radiusY,
        rotation: ellipseFit.rotation,
        eccentricity: ellipseFit.eccentricity,
        isCircular: isCircle,
        area: Math.PI * ellipseFit.radiusX * ellipseFit.radiusY
      }
    });
    
    return {
      confidence,
      shape,
      error: normalizedError,
      metadata: {
        analysis,
        ellipseFit
      }
    };
  }
  
  private fitEllipse(points: Point[], bbox: BoundingBox): EllipseFit | null {
    // Use multiple approaches and pick the best one
    
    // Approach 1: Simple bounding box ellipse
    const boundingBoxFit = this.fitBoundingBoxEllipse(bbox);
    
    // Approach 2: Least squares ellipse fitting (simplified)
    const leastSquaresFit = this.fitLeastSquaresEllipse(points);
    
    // Approach 3: Moment-based ellipse fitting
    const momentFit = this.fitMomentEllipse(points);
    
    // Choose the best fit based on error
    const candidates = [boundingBoxFit, leastSquaresFit, momentFit].filter(fit => fit !== null);
    if (candidates.length === 0) return null;
    
    return candidates.reduce((best, current) => {
      const bestError = this.calculateEllipseError(points, best);
      const currentError = this.calculateEllipseError(points, current);
      return currentError < bestError ? current : best;
    });
  }
  
  private fitBoundingBoxEllipse(bbox: BoundingBox): EllipseFit {
    const center = { x: bbox.centerX, y: bbox.centerY };
    const radiusX = bbox.width / 2;
    const radiusY = bbox.height / 2;
    
    const eccentricity = radiusX !== radiusY ? 
      Math.sqrt(1 - Math.min(radiusX, radiusY) ** 2 / Math.max(radiusX, radiusY) ** 2) : 0;
    
    return {
      center,
      radiusX,
      radiusY,
      rotation: 0,
      eccentricity
    };
  }
  
  private fitLeastSquaresEllipse(points: Point[]): EllipseFit | null {
    // Simplified least squares ellipse fitting
    // For a more robust implementation, you'd use algebraic ellipse fitting
    
    if (points.length < 5) return null;
    
    // Calculate centroid
    let centerX = 0, centerY = 0;
    for (const point of points) {
      centerX += point.x;
      centerY += point.y;
    }
    centerX /= points.length;
    centerY /= points.length;
    
    // Calculate covariance matrix
    let sxx = 0, syy = 0, sxy = 0;
    for (const point of points) {
      const dx = point.x - centerX;
      const dy = point.y - centerY;
      sxx += dx * dx;
      syy += dy * dy;
      sxy += dx * dy;
    }
    sxx /= points.length;
    syy /= points.length;
    sxy /= points.length;
    
    // Eigenvalue decomposition (simplified)
    const trace = sxx + syy;
    const det = sxx * syy - sxy * sxy;
    const discriminant = Math.sqrt(trace * trace - 4 * det);
    
    const lambda1 = (trace + discriminant) / 2;
    const lambda2 = (trace - discriminant) / 2;
    
    if (lambda1 <= 0 || lambda2 <= 0) return null;
    
    const radiusX = Math.sqrt(lambda1) * 2;
    const radiusY = Math.sqrt(lambda2) * 2;
    
    // Calculate rotation
    let rotation = 0;
    if (Math.abs(sxy) > 1e-10) {
      rotation = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    }
    
    const eccentricity = radiusX !== radiusY ? 
      Math.sqrt(1 - Math.min(radiusX, radiusY) ** 2 / Math.max(radiusX, radiusY) ** 2) : 0;
    
    return {
      center: { x: centerX, y: centerY },
      radiusX,
      radiusY,
      rotation,
      eccentricity
    };
  }
  
  private fitMomentEllipse(points: Point[]): EllipseFit | null {
    // Moment-based fitting using the distribution of points
    
    if (points.length < 5) return null;
    
    // Calculate centroid
    let centerX = 0, centerY = 0;
    for (const point of points) {
      centerX += point.x;
      centerY += point.y;
    }
    centerX /= points.length;
    centerY /= points.length;
    
    // Calculate average distance from center
    let avgDistanceX = 0, avgDistanceY = 0;
    for (const point of points) {
      avgDistanceX += Math.abs(point.x - centerX);
      avgDistanceY += Math.abs(point.y - centerY);
    }
    avgDistanceX /= points.length;
    avgDistanceY /= points.length;
    
    // Estimate radii (this is a rough approximation)
    const radiusX = avgDistanceX * Math.PI / 2; // Convert from average deviation to radius
    const radiusY = avgDistanceY * Math.PI / 2;
    
    const eccentricity = radiusX !== radiusY ? 
      Math.sqrt(1 - Math.min(radiusX, radiusY) ** 2 / Math.max(radiusX, radiusY) ** 2) : 0;
    
    return {
      center: { x: centerX, y: centerY },
      radiusX,
      radiusY,
      rotation: 0,
      eccentricity
    };
  }
  
  private calculateEllipseError(points: Point[], ellipse: EllipseFit): number {
    let totalError = 0;
    
    for (const point of points) {
      const error = this.distanceToEllipse(point, ellipse);
      totalError += error;
    }
    
    return totalError / points.length;
  }
  
  private distanceToEllipse(point: Point, ellipse: EllipseFit): number {
    // Transform point to ellipse coordinate system
    const dx = point.x - ellipse.center.x;
    const dy = point.y - ellipse.center.y;
    
    // Apply rotation
    const cos = Math.cos(-ellipse.rotation);
    const sin = Math.sin(-ellipse.rotation);
    const x = dx * cos - dy * sin;
    const y = dx * sin + dy * cos;
    
    // Calculate distance to ellipse (approximation)
    // For exact distance, you'd need iterative methods
    const normalizedX = x / ellipse.radiusX;
    const normalizedY = y / ellipse.radiusY;
    const distanceToCenter = Math.sqrt(normalizedX * normalizedX + normalizedY * normalizedY);
    
    return Math.abs(distanceToCenter - 1) * Math.min(ellipse.radiusX, ellipse.radiusY);
  }
  
  private isCircular(ellipse: EllipseFit, tolerance: number): boolean {
    const aspectRatio = Math.max(ellipse.radiusX, ellipse.radiusY) / Math.min(ellipse.radiusX, ellipse.radiusY);
    return aspectRatio - 1 < tolerance;
  }
}

interface EllipseFit {
  center: Point;
  radiusX: number;
  radiusY: number;
  rotation: number;
  eccentricity: number;
}
