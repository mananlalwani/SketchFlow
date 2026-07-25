/**
 * Line detection algorithm
 */

import { Point, fitLine, calculateLineError, distance } from '../geometry';
import { ProcessedStroke, analyzeStroke } from '../strokeProcessor';
import { ShapeDetector, DetectionResult, DetectionThresholds, createDetectedShape } from './types';

export class LineDetector implements ShapeDetector {
  readonly shapeType = 'line';
  readonly priority = 10;

  detect(stroke: ProcessedStroke, thresholds: DetectionThresholds): DetectionResult | null {
    const points = stroke.processedPoints;

    // Quick rejection tests
    if (points.length < 2) {
      console.log(`Line: REJECT - too few points: ${points.length} < 2`);
      return null;
    }
    if (stroke.isClosed) {
      console.log(`Line: REJECT - closed stroke`);
      return null; // Lines should not be closed
    }
    if (
      stroke.boundingBox.width < thresholds.lineMinLength &&
      stroke.boundingBox.height < thresholds.lineMinLength
    ) {
      console.log(
        `Line: REJECT - too short: width=${stroke.boundingBox.width.toFixed(1)}, height=${stroke.boundingBox.height.toFixed(1)} < ${thresholds.lineMinLength}`,
      );
      return null;
    }

    // Fit a line to the points
    const lineEquation = fitLine(points);
    if (!lineEquation) {
      console.log(`Line: REJECT - line fitting failed`);
      return null;
    }

    // Calculate fitting error
    const error = calculateLineError(points, lineEquation);
    const normalizedError = error / Math.max(stroke.boundingBox.width, stroke.boundingBox.height);

    console.log(
      `Line: Fitted - error=${normalizedError.toFixed(3)}, isVertical=${lineEquation.isVertical}, slope=${lineEquation.slope?.toFixed(3) || 'N/A'}`,
    );

    // Check if error is acceptable
    if (normalizedError > thresholds.lineMaxError) {
      console.log(
        `Line: REJECT - error too high: ${normalizedError.toFixed(3)} > ${thresholds.lineMaxError}`,
      );
      return null;
    }

    // Calculate straightness (how much the stroke deviates from straight)
    const strokeAnalysis = analyzeStroke(stroke);
    if (strokeAnalysis.hasSharpCorners && strokeAnalysis.cornerCount >= 2) {
      console.log(`Line: REJECT - complex stroke with ${strokeAnalysis.cornerCount} corners`);
      return null;
    }
    if (strokeAnalysis.dominantDirection === 'circular') {
      console.log(`Line: REJECT - stroke exhibits circular motion`);
      return null;
    }
    if (stroke.complexity > thresholds.lineMaxComplexity) {
      console.log(
        `Line: REJECT - complexity too high: ${stroke.complexity.toFixed(3)} > ${thresholds.lineMaxComplexity}`,
      );
      return null;
    }
    if (strokeAnalysis.straightSegmentRatio < thresholds.lineMinStraightSegmentRatio) {
      console.log(
        `Line: REJECT - straight segment ratio too low: ${strokeAnalysis.straightSegmentRatio.toFixed(3)} < ${thresholds.lineMinStraightSegmentRatio}`,
      );
      return null;
    }

    const straightness = this.calculateStraightness(points);
    if (straightness < thresholds.lineMinStraightness) {
      console.log(
        `Line: REJECT - not straight enough: ${straightness.toFixed(3)} < ${thresholds.lineMinStraightness}`,
      );
      return null;
    }

    // Calculate confidence based on multiple indicators
    const errorConfidence = 1 - Math.min(1, normalizedError / thresholds.lineMaxError);
    const straightSegmentConfidence = Math.min(
      1,
      strokeAnalysis.straightSegmentRatio / thresholds.lineMinStraightSegmentRatio,
    );
    const complexityConfidence = Math.max(0, 1 - stroke.complexity / thresholds.lineMaxComplexity);
    const straightnessConfidence = straightness;
    const baseConfidence = Math.max(errorConfidence, straightnessConfidence);
    const confidence = (baseConfidence + straightSegmentConfidence + complexityConfidence) / 3;

    if (confidence < thresholds.minConfidence) {
      console.log(
        `Line: REJECT - confidence too low: ${confidence.toFixed(3)} < ${thresholds.minConfidence}`,
      );
      return null;
    }

    console.log(
      `Line: SUCCESS - line detected with confidence ${confidence.toFixed(3)}, straightness ${straightness.toFixed(3)}`,
    );

    // Create the detected shape
    const startPoint = points[0];
    const endPoint = points[points.length - 1];

    // Detect if line is horizontal or vertical
    const orientation = this.getLineOrientation(startPoint, endPoint);

    const shape = createDetectedShape('line', stroke.boundingBox, {
      points: [startPoint, endPoint],
      properties: {
        slope: lineEquation.slope,
        intercept: lineEquation.intercept,
        isVertical: lineEquation.isVertical,
        isHorizontal: orientation === 'horizontal',
        orientation,
        length: distance(startPoint, endPoint),
        angle: Math.atan2(endPoint.y - startPoint.y, endPoint.x - startPoint.x),
      },
    });

    return {
      confidence,
      shape,
      error: normalizedError,
      metadata: {
        straightness,
        lineEquation,
        strokeAnalysis,
        complexity: stroke.complexity,
      },
    };
  }

  private getLineOrientation(start: Point, end: Point): 'horizontal' | 'vertical' | 'diagonal' {
    const dx = Math.abs(end.x - start.x);
    const dy = Math.abs(end.y - start.y);
    const threshold = 0.15; // 15% tolerance

    if (dy < dx * threshold) return 'horizontal';
    if (dx < dy * threshold) return 'vertical';
    return 'diagonal';
  }

  private calculateStraightness(points: Point[]): number {
    if (points.length < 3) return 1;

    const startPoint = points[0];
    const endPoint = points[points.length - 1];
    const totalDirectDistance = distance(startPoint, endPoint);

    if (totalDirectDistance < 1) return 0;

    // Calculate total path length
    let pathLength = 0;
    for (let i = 1; i < points.length; i++) {
      pathLength += distance(points[i - 1], points[i]);
    }

    // Straightness is the ratio of direct distance to path length
    const straightness = totalDirectDistance / pathLength;

    // Also consider angular deviations
    let maxAngularDeviation = 0;
    const idealDirection = {
      x: endPoint.x - startPoint.x,
      y: endPoint.y - startPoint.y,
    };
    const idealLength = Math.sqrt(idealDirection.x ** 2 + idealDirection.y ** 2);

    if (idealLength > 0) {
      idealDirection.x /= idealLength;
      idealDirection.y /= idealLength;

      for (let i = 1; i < points.length; i++) {
        const segmentDirection = {
          x: points[i].x - points[i - 1].x,
          y: points[i].y - points[i - 1].y,
        };
        const segmentLength = Math.sqrt(segmentDirection.x ** 2 + segmentDirection.y ** 2);

        if (segmentLength > 0) {
          segmentDirection.x /= segmentLength;
          segmentDirection.y /= segmentLength;

          const dot = idealDirection.x * segmentDirection.x + idealDirection.y * segmentDirection.y;
          const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
          maxAngularDeviation = Math.max(maxAngularDeviation, angle);
        }
      }
    }

    const angularFactor = 1 - maxAngularDeviation / Math.PI;

    // Weight path straightness more heavily than angular consistency
    return straightness * 0.7 + angularFactor * 0.3;
  }
}
