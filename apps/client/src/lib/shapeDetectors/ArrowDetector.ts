/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * Arrow detection algorithm
 *
 * Detects hand-drawn arrows consisting of a line (shaft) with a V-shaped head
 * at one or both ends.
 */

import { Point, distance, createVector, angleBetween, distanceToLine } from '../geometry';
import { ProcessedStroke, analyzeStroke } from '../strokeProcessor';
import { ShapeDetector, DetectionResult, DetectionThresholds, createDetectedShape } from './types';

interface ArrowCandidate {
  shaftStart: Point;
  shaftEnd: Point;
  headTip: Point;
  headWing1: Point;
  headWing2: Point;
  direction: 'start' | 'end' | 'both';
  confidence: number;
}

export class ArrowDetector implements ShapeDetector {
  readonly shapeType = 'arrow';
  readonly priority = 15; // Higher priority than line to catch arrows first

  detect(stroke: ProcessedStroke, thresholds: DetectionThresholds): DetectionResult | null {
    const points = stroke.processedPoints;

    // Arrows need at least 5 points (shaft + V head)
    if (points.length < 5) {
      return null;
    }

    // Arrows should not be closed shapes
    if (stroke.isClosed) {
      return null;
    }

    // Minimum size check
    const minSize = 30; // Arrows should be reasonably sized
    if (stroke.boundingBox.width < minSize && stroke.boundingBox.height < minSize) {
      return null;
    }

    // Analyze the stroke
    const strokeAnalysis = analyzeStroke(stroke);

    // Arrows typically have 1-3 sharp corners (1 for arrow head point, or 2 for V shape)
    if (strokeAnalysis.cornerCount > 4) {
      return null;
    }

    // Try to detect arrow pattern
    const arrowCandidate = this.findArrowPattern(points, thresholds);
    if (!arrowCandidate) {
      return null;
    }

    // Calculate overall confidence
    const confidence = arrowCandidate.confidence;

    if (confidence < (thresholds.minConfidence || 0.5)) {
      return null;
    }

    // Calculate the arrow direction angle
    const shaftVector = createVector(arrowCandidate.shaftStart, arrowCandidate.shaftEnd);
    const orientation = Math.atan2(shaftVector.y, shaftVector.x);

    // Create the detected shape
    const shape = createDetectedShape('arrow', stroke.boundingBox, {
      points: [
        arrowCandidate.shaftStart,
        arrowCandidate.shaftEnd,
        arrowCandidate.headTip,
        arrowCandidate.headWing1,
        arrowCandidate.headWing2,
      ],
      orientation,
      properties: {
        direction: arrowCandidate.direction,
        shaftLength: distance(arrowCandidate.shaftStart, arrowCandidate.shaftEnd),
        headSize: Math.max(
          distance(arrowCandidate.headTip, arrowCandidate.headWing1),
          distance(arrowCandidate.headTip, arrowCandidate.headWing2),
        ),
      },
    });

    return {
      confidence,
      shape,
      error: 1 - confidence,
    };
  }

  private findArrowPattern(
    points: Point[],
    _thresholds: DetectionThresholds,
  ): ArrowCandidate | null {
    // Try detecting arrow at the end first (most common)
    const endArrow = this.detectArrowHead(points, 'end');
    if (endArrow && endArrow.confidence > 0.6) {
      return endArrow;
    }

    // Try detecting arrow at the start
    const startArrow = this.detectArrowHead(points, 'start');
    if (startArrow && startArrow.confidence > 0.6) {
      return startArrow;
    }

    // Try detecting double-headed arrow
    if (endArrow && startArrow) {
      const bothArrow: ArrowCandidate = {
        ...endArrow,
        direction: 'both',
        confidence: (endArrow.confidence + startArrow.confidence) / 2,
      };
      if (bothArrow.confidence > 0.5) {
        return bothArrow;
      }
    }

    return endArrow || startArrow;
  }

  private detectArrowHead(points: Point[], direction: 'start' | 'end'): ArrowCandidate | null {
    const n = points.length;
    if (n < 5) return null;

    // Arrow typically looks like:
    // For 'end' direction: ----->
    //   The shaft goes from points[0] to somewhere near the end
    //   The head is a V-shape at the end

    // For 'start' direction: <-----
    //   The head is at the start, shaft goes to the end

    const orderedPoints = direction === 'end' ? points : [...points].reverse();

    // Find corners/direction changes that might indicate the arrowhead
    const corners = this.findCorners(orderedPoints);

    if (corners.length < 1) {
      // Try a simpler detection for smooth arrow drawings
      return this.detectSmoothArrow(orderedPoints, direction);
    }

    // The arrowhead should be near the end of the stroke
    // Look for a V-shape pattern in the last portion
    const headStartIndex = Math.floor(n * 0.6);
    const headPortion = orderedPoints.slice(headStartIndex);

    if (headPortion.length < 3) return null;

    // Analyze the head portion for V-shape
    const vShape = this.analyzeVShape(headPortion);
    if (!vShape) return null;

    // Calculate shaft - the relatively straight portion before the head
    const shaftPortion = orderedPoints.slice(0, headStartIndex + 1);
    const shaftStraightness = this.calculateStraightness(shaftPortion);

    if (shaftStraightness < 0.6) return null;

    // The tip is at the end
    const headTip = orderedPoints[n - 1];
    const shaftStart = orderedPoints[0];

    // Find where the shaft ends (approximately where V starts)
    const shaftEnd = this.findShaftEnd(orderedPoints, vShape.apexIndex + headStartIndex);

    // Calculate confidence
    const confidence = this.calculateArrowConfidence(
      shaftStraightness,
      vShape.symmetry,
      vShape.angleQuality,
    );

    return {
      shaftStart: direction === 'end' ? shaftStart : headTip,
      shaftEnd: direction === 'end' ? shaftEnd : shaftStart,
      headTip: direction === 'end' ? headTip : shaftStart,
      headWing1: vShape.wing1,
      headWing2: vShape.wing2,
      direction,
      confidence,
    };
  }

  private detectSmoothArrow(points: Point[], direction: 'start' | 'end'): ArrowCandidate | null {
    const n = points.length;
    if (n < 5) return null;

    // For smooth arrows, check if the last portion fans out in a V-like pattern
    const shaftEnd = Math.floor(n * 0.65);
    const shaftPortion = points.slice(0, shaftEnd);

    const shaftStraightness = this.calculateStraightness(shaftPortion);
    if (shaftStraightness < 0.5) return null;

    // The main direction of the shaft
    const shaftVector = createVector(points[0], points[shaftEnd]);

    // Check if the end portion deviates to form arrowhead
    const headPortion = points.slice(shaftEnd);
    if (headPortion.length < 2) return null;

    // Look for direction change at the end indicating an arrowhead
    const directionChanges = this.analyzeDirectionChanges(headPortion, shaftVector);

    if (!directionChanges.hasArrowPattern) return null;

    const tip = points[n - 1];
    const shaftEndPoint = points[shaftEnd];

    // Estimate wing positions based on head geometry
    const headMid = Math.floor(shaftEnd + (n - shaftEnd) / 2);

    return {
      shaftStart: direction === 'end' ? points[0] : tip,
      shaftEnd: shaftEndPoint,
      headTip: tip,
      headWing1: points[headMid] || headPortion[0],
      headWing2: points[Math.min(headMid + 1, n - 1)] || headPortion[headPortion.length - 1],
      direction,
      confidence: (shaftStraightness + directionChanges.quality) / 2,
    };
  }

  private findCorners(points: Point[]): number[] {
    const corners: number[] = [];
    const angleThreshold = Math.PI / 4; // 45 degrees

    for (let i = 2; i < points.length - 2; i++) {
      const v1 = createVector(points[i - 2], points[i]);
      const v2 = createVector(points[i], points[i + 2]);
      const angle = angleBetween(v1, v2);

      if (angle > angleThreshold) {
        corners.push(i);
      }
    }

    return corners;
  }

  private analyzeVShape(points: Point[]): {
    apexIndex: number;
    wing1: Point;
    wing2: Point;
    symmetry: number;
    angleQuality: number;
  } | null {
    const n = points.length;
    if (n < 3) return null;

    // Find the point with the sharpest angle (the apex of the V)
    let maxAngle = 0;
    let apexIndex = Math.floor(n / 2);

    for (let i = 1; i < n - 1; i++) {
      const v1 = createVector(points[i], points[i - 1]);
      const v2 = createVector(points[i], points[Math.min(i + 1, n - 1)]);
      const angle = angleBetween(v1, v2);

      // For V-shape, we want a relatively sharp but not too acute angle (30-120 degrees)
      if (angle > Math.PI / 6 && angle < (2 * Math.PI) / 3 && angle > maxAngle) {
        maxAngle = angle;
        apexIndex = i;
      }
    }

    // If no good apex found, use the endpoint
    if (maxAngle === 0) {
      return null;
    }

    const wing1 = points[0];
    const wing2 = points[n - 1];
    const apex = points[apexIndex];

    // Calculate symmetry of the V
    const d1 = distance(apex, wing1);
    const d2 = distance(apex, wing2);
    const symmetry = Math.min(d1, d2) / Math.max(d1, d2);

    // Angle quality - ideal arrow head is 30-90 degrees
    const angleQuality = maxAngle > Math.PI / 6 && maxAngle < Math.PI / 2 ? 0.9 : 0.6;

    return {
      apexIndex,
      wing1,
      wing2,
      symmetry,
      angleQuality,
    };
  }

  private findShaftEnd(points: Point[], approximateIndex: number): Point {
    // Find where the relatively straight shaft ends
    const idx = Math.max(0, Math.min(approximateIndex, points.length - 1));
    return points[idx];
  }

  private calculateStraightness(points: Point[]): number {
    if (points.length < 2) return 1;

    const start = points[0];
    const end = points[points.length - 1];
    const directDistance = distance(start, end);

    if (directDistance < 1) return 0;

    // Calculate how close points are to the line
    let totalDeviation = 0;
    for (const point of points) {
      totalDeviation += distanceToLine(point, start, end);
    }

    const avgDeviation = totalDeviation / points.length;
    const normalizedDeviation = avgDeviation / directDistance;

    return Math.max(0, 1 - normalizedDeviation * 5);
  }

  private analyzeDirectionChanges(
    points: Point[],
    mainDirection: ReturnType<typeof createVector>,
  ): { hasArrowPattern: boolean; quality: number } {
    if (points.length < 2) {
      return { hasArrowPattern: false, quality: 0 };
    }

    // Check if points diverge from main direction
    let divergenceCount = 0;
    let totalAngleChange = 0;

    for (let i = 1; i < points.length; i++) {
      const segmentVector = createVector(points[i - 1], points[i]);
      if (segmentVector.magnitude < 0.1) continue;

      const angle = angleBetween(mainDirection, segmentVector);
      if (angle > Math.PI / 6) {
        // More than 30 degrees deviation
        divergenceCount++;
        totalAngleChange += angle;
      }
    }

    // Arrow head should have some divergence but not too chaotic
    const hasArrowPattern = divergenceCount >= 1 && divergenceCount <= points.length * 0.7;
    const avgAngle = divergenceCount > 0 ? totalAngleChange / divergenceCount : 0;
    const quality = hasArrowPattern ? Math.min(1, avgAngle / (Math.PI / 3)) : 0;

    return { hasArrowPattern, quality };
  }

  private calculateArrowConfidence(
    shaftStraightness: number,
    vSymmetry: number,
    angleQuality: number,
  ): number {
    // Weighted combination of factors
    return shaftStraightness * 0.4 + vSymmetry * 0.3 + angleQuality * 0.3;
  }
}
