/**
 * Star detection algorithm
 *
 * Detects hand-drawn stars (5-pointed and 6-pointed stars)
 * Stars have a characteristic pattern of alternating inner and outer vertices
 */

import { Point, distance } from '../geometry';
import { ProcessedStroke, analyzeStroke } from '../strokeProcessor';
import { ShapeDetector, DetectionResult, DetectionThresholds, createDetectedShape } from './types';

interface StarCandidate {
  center: Point;
  outerRadius: number;
  innerRadius: number;
  points: number; // 5 or 6 pointed
  vertices: Point[];
  confidence: number;
}

export class StarDetector implements ShapeDetector {
  readonly shapeType = 'star';
  readonly priority = 14;

  detect(stroke: ProcessedStroke, thresholds: DetectionThresholds): DetectionResult | null {
    const points = stroke.processedPoints;

    // Stars need enough points to form the pattern
    if (points.length < 10) {
      return null;
    }

    // Stars should be closed shapes
    if (!stroke.isClosed) {
      return null;
    }

    // Minimum size check
    const minSize = 30;
    if (stroke.boundingBox.width < minSize || stroke.boundingBox.height < minSize) {
      return null;
    }

    // Analyze the stroke
    const strokeAnalysis = analyzeStroke(stroke);

    // Stars typically have 5-12 corners (vertices)
    if (strokeAnalysis.cornerCount < 4 || strokeAnalysis.cornerCount > 14) {
      return null;
    }

    // Try to detect star pattern
    const starCandidate = this.findStarPattern(points, stroke.boundingBox);
    if (!starCandidate) {
      return null;
    }

    const confidence = starCandidate.confidence;

    if (confidence < (thresholds.minConfidence || 0.5)) {
      return null;
    }

    // Create the detected shape
    const shape = createDetectedShape('star', stroke.boundingBox, {
      center: starCandidate.center,
      points: starCandidate.vertices,
      properties: {
        pointCount: starCandidate.points,
        outerRadius: starCandidate.outerRadius,
        innerRadius: starCandidate.innerRadius,
        radiusRatio: starCandidate.innerRadius / starCandidate.outerRadius,
      },
    });

    return {
      confidence,
      shape,
      error: 1 - confidence,
    };
  }

  private findStarPattern(
    points: Point[],
    bbox: { centerX: number; centerY: number; width: number; height: number },
  ): StarCandidate | null {
    const center: Point = { x: bbox.centerX, y: bbox.centerY };

    // Calculate distances from center for each point
    const distances = points.map((p) => distance(p, center));

    // Find peaks (outer vertices) and valleys (inner vertices)
    const { peaks, valleys } = this.findPeaksAndValleys(distances);

    // Stars typically have 5 or 6 outer peaks
    if (peaks.length < 4 || peaks.length > 8) {
      return null;
    }

    // For a valid star, there should be roughly equal number of peaks and valleys
    if (Math.abs(peaks.length - valleys.length) > 1) {
      return null;
    }

    // Calculate average radii
    const outerRadius = peaks.reduce((sum, idx) => sum + distances[idx], 0) / peaks.length;
    const innerRadius = valleys.reduce((sum, idx) => sum + distances[idx], 0) / valleys.length;

    // For a star, inner radius should be significantly smaller than outer (typically 30-60%)
    const radiusRatio = innerRadius / outerRadius;
    if (radiusRatio < 0.2 || radiusRatio > 0.8) {
      return null;
    }

    // Check regularity of the star
    const regularity = this.calculateStarRegularity(
      points,
      peaks,
      valleys,
      center,
      outerRadius,
      innerRadius,
    );
    if (regularity < 0.5) {
      return null;
    }

    // Check angular distribution
    const angularRegularity = this.checkAngularDistribution(points, peaks, center);

    // Get the vertex points
    const vertices = peaks.map((idx) => points[idx]);

    // Calculate confidence
    const confidence = this.calculateStarConfidence(
      regularity,
      angularRegularity,
      radiusRatio,
      peaks.length,
    );

    return {
      center,
      outerRadius,
      innerRadius,
      points: peaks.length,
      vertices,
      confidence,
    };
  }

  private findPeaksAndValleys(distances: number[]): { peaks: number[]; valleys: number[] } {
    const peaks: number[] = [];
    const valleys: number[] = [];
    const n = distances.length;

    // Smooth the distances to reduce noise
    const smoothed = this.smoothArray(distances, 3);

    // Find local maxima (peaks) and minima (valleys)
    for (let i = 2; i < n - 2; i++) {
      const current = smoothed[i];
      const prevPrev = smoothed[i - 2];
      const prev = smoothed[i - 1];
      const next = smoothed[i + 1];
      const nextNext = smoothed[i + 2];

      // Peak detection - local maximum
      if (current > prev && current > next && current >= prevPrev && current >= nextNext) {
        // Avoid adding peaks too close together
        if (peaks.length === 0 || i - peaks[peaks.length - 1] > n / 15) {
          peaks.push(i);
        }
      }

      // Valley detection - local minimum
      if (current < prev && current < next && current <= prevPrev && current <= nextNext) {
        if (valleys.length === 0 || i - valleys[valleys.length - 1] > n / 15) {
          valleys.push(i);
        }
      }
    }

    return { peaks, valleys };
  }

  private smoothArray(arr: number[], windowSize: number): number[] {
    const result = new Array(arr.length);
    const halfWindow = Math.floor(windowSize / 2);

    for (let i = 0; i < arr.length; i++) {
      let sum = 0;
      let count = 0;

      for (let j = -halfWindow; j <= halfWindow; j++) {
        const idx = i + j;
        if (idx >= 0 && idx < arr.length) {
          sum += arr[idx];
          count++;
        }
      }

      result[i] = sum / count;
    }

    return result;
  }

  private calculateStarRegularity(
    points: Point[],
    peaks: number[],
    valleys: number[],
    center: Point,
    expectedOuter: number,
    expectedInner: number,
  ): number {
    // Check how consistent the peak and valley distances are
    let outerVariance = 0;
    let innerVariance = 0;

    for (const idx of peaks) {
      const d = distance(points[idx], center);
      outerVariance += Math.pow(d - expectedOuter, 2);
    }

    for (const idx of valleys) {
      const d = distance(points[idx], center);
      innerVariance += Math.pow(d - expectedInner, 2);
    }

    const avgOuterVar = peaks.length > 0 ? outerVariance / peaks.length : 0;
    const avgInnerVar = valleys.length > 0 ? innerVariance / valleys.length : 0;

    const outerRegularity = 1 - Math.min(1, Math.sqrt(avgOuterVar) / expectedOuter);
    const innerRegularity = 1 - Math.min(1, Math.sqrt(avgInnerVar) / expectedInner);

    return (outerRegularity + innerRegularity) / 2;
  }

  private checkAngularDistribution(points: Point[], peaks: number[], center: Point): number {
    if (peaks.length < 3) return 0;

    // Calculate angles from center to each peak
    const angles: number[] = peaks.map((idx) => {
      const p = points[idx];
      return Math.atan2(p.y - center.y, p.x - center.x);
    });

    // Sort angles
    angles.sort((a, b) => a - b);

    // Calculate angular gaps
    const expectedGap = (2 * Math.PI) / peaks.length;
    let gapVariance = 0;

    for (let i = 0; i < angles.length; i++) {
      const next = (i + 1) % angles.length;
      let gap = angles[next] - angles[i];
      if (gap < 0) gap += 2 * Math.PI;
      gapVariance += Math.pow(gap - expectedGap, 2);
    }

    const avgGapVar = gapVariance / angles.length;
    const regularity = 1 - Math.min(1, Math.sqrt(avgGapVar) / expectedGap);

    return regularity;
  }

  private calculateStarConfidence(
    regularity: number,
    angularRegularity: number,
    radiusRatio: number,
    pointCount: number,
  ): number {
    // Ideal stars have:
    // - High regularity in vertex distances
    // - Even angular distribution
    // - Inner radius about 38% of outer for 5-pointed star
    // - 5 or 6 points

    const idealRatio = pointCount === 5 ? 0.38 : 0.5;
    const ratioScore = 1 - Math.min(1, Math.abs(radiusRatio - idealRatio) / 0.3);

    const pointScore = pointCount === 5 || pointCount === 6 ? 1 : 0.7;

    return regularity * 0.3 + angularRegularity * 0.35 + ratioScore * 0.2 + pointScore * 0.15;
  }
}
