/**
 * Parabola detection algorithm
 */

import { Point, BoundingBox, fitParabola, calculateParabolaError } from '../geometry';
import { ProcessedStroke, analyzeStroke } from '../strokeProcessor';
import { ShapeDetector, DetectionResult, DetectionThresholds, createDetectedShape } from './types';

export class ParabolaDetector implements ShapeDetector {
  readonly shapeType = 'parabola';
  readonly priority = 1;

  detect(stroke: ProcessedStroke, thresholds: DetectionThresholds): DetectionResult | null {
    const points = stroke.processedPoints;

    // Quick rejection tests
    if (points.length < 6) {
      console.log(`Parabola: REJECT - too few points: ${points.length} < 6`);
      return null;
    }
    if (stroke.isClosed) {
      console.log(`Parabola: REJECT - closed curve`);
      return null; // Parabolas should be open curves
    }

    const analysis = analyzeStroke(stroke);

    console.log(
      `Parabola: Initial analysis - complexity=${stroke.complexity.toFixed(3)}, smooth=${stroke.isSmooth}, corners=${analysis.cornerCount}, direction=${analysis.dominantDirection}`,
    );

    // Should have some curvature (parabolas are curved, not straight)
    if (stroke.complexity < thresholds.parabolaMinCurvature) {
      console.log(
        `Parabola: REJECT - low curvature: ${stroke.complexity.toFixed(3)} < ${thresholds.parabolaMinCurvature}`,
      );
      return null;
    }

    // Parabolas shouldn't be too circular
    if (analysis.dominantDirection === 'circular' && stroke.complexity > 0.3) {
      console.log(
        `Parabola: REJECT - too circular for parabola (direction=${analysis.dominantDirection}, complexity=${stroke.complexity.toFixed(3)})`,
      );
      return null;
    }

    // Allow some corners but not too many
    if (analysis.hasSharpCorners && analysis.cornerCount > 2) {
      console.log(`Parabola: REJECT - too many corners: ${analysis.cornerCount} > 2`);
      return null;
    }

    // Fit parabola to the points
    const parabolaFit = fitParabola(points);
    if (!parabolaFit) {
      console.log(`Parabola: REJECT - parabola fitting failed`);
      return null;
    }

    console.log(
      `Parabola: Fitted ${parabolaFit.isVertical ? 'vertical' : 'horizontal'} parabola: a=${parabolaFit.a.toFixed(4)}, b=${parabolaFit.b.toFixed(4)}, c=${parabolaFit.c.toFixed(4)}`,
    );

    // Validate that coefficient 'a' is reasonable (not too flat, not too steep)
    const maxSize = Math.max(stroke.boundingBox.width, stroke.boundingBox.height);
    const minA = 0.00001; // Too flat - essentially a straight line
    const maxA = 0.1; // Too steep - very sharp curvature

    if (Math.abs(parabolaFit.a) < minA) {
      console.log(
        `Parabola: REJECT - too flat: |a|=${Math.abs(parabolaFit.a).toFixed(6)} < ${minA}`,
      );
      return null;
    }

    // For smaller shapes, allow steeper parabolas
    const sizeAdjustedMaxA = maxSize < 100 ? maxA * 2 : maxA;
    if (Math.abs(parabolaFit.a) > sizeAdjustedMaxA) {
      console.log(
        `Parabola: REJECT - too steep: |a|=${Math.abs(parabolaFit.a).toFixed(6)} > ${sizeAdjustedMaxA.toFixed(6)}`,
      );
      return null;
    }

    // Calculate fitting error
    const error = calculateParabolaError(points, parabolaFit);
    const normalizedError = error / Math.max(stroke.boundingBox.width, stroke.boundingBox.height);

    if (normalizedError > thresholds.parabolaMaxError) {
      console.log(
        `Parabola: REJECT - error too high: ${normalizedError.toFixed(3)} > ${thresholds.parabolaMaxError}`,
      );
      return null;
    }

    // Validate parabola properties
    const parabolaInfo = this.analyzeParabola(points, parabolaFit, stroke.boundingBox);
    if (!parabolaInfo) {
      console.log(`Parabola: REJECT - vertex outside reasonable bounds`);
      return null;
    }

    console.log(
      `Parabola: Analysis - vertex=(${parabolaInfo.vertex.x.toFixed(1)}, ${parabolaInfo.vertex.y.toFixed(1)}), symmetry=${parabolaInfo.symmetry.toFixed(3)}, direction=${parabolaInfo.openDirection}`,
    );

    // Check symmetry
    if (parabolaInfo.symmetry < thresholds.parabolaSymmetryTolerance) {
      console.log(
        `Parabola: REJECT - low symmetry: ${parabolaInfo.symmetry.toFixed(3)} < ${thresholds.parabolaSymmetryTolerance}`,
      );
      return null;
    }

    // Calculate confidence
    const curvatureConfidence = Math.min(1, stroke.complexity / thresholds.parabolaMinCurvature);
    const smoothnessConfidence = stroke.isSmooth ? 1 : 0.7;
    const errorConfidence = 1 - Math.min(1, normalizedError / thresholds.parabolaMaxError);
    const symmetryConfidence = parabolaInfo.symmetry;
    const openConfidence = stroke.isClosed ? 0 : 1;

    const confidence =
      (curvatureConfidence +
        smoothnessConfidence +
        errorConfidence +
        symmetryConfidence +
        openConfidence) /
      5;

    if (confidence < thresholds.minConfidence) {
      console.log(
        `Parabola: REJECT - low confidence: ${confidence.toFixed(3)} < ${thresholds.minConfidence}`,
      );
      return null;
    }

    console.log(
      `Parabola: SUCCESS - parabola detected with confidence ${confidence.toFixed(3)}, error ${normalizedError.toFixed(3)}`,
    );

    // Create the detected shape
    const shape = createDetectedShape('parabola', stroke.boundingBox, {
      center: parabolaInfo.vertex,
      properties: {
        equation: parabolaFit,
        vertex: parabolaInfo.vertex,
        focus: parabolaInfo.focus,
        directrix: parabolaInfo.directrix,
        orientation: parabolaInfo.orientation,
        openDirection: parabolaInfo.openDirection,
        symmetry: parabolaInfo.symmetry,
        curvature: stroke.complexity,
      },
    });

    return {
      confidence,
      shape,
      error: normalizedError,
      metadata: {
        analysis,
        parabolaFit,
        parabolaInfo,
        curvature: stroke.complexity,
      },
    };
  }

  private analyzeParabola(
    points: Point[],
    equation: { a: number; b: number; c: number; isVertical: boolean },
    bbox: BoundingBox,
  ): ParabolaInfo | null {
    // Calculate vertex
    let vertex: Point;
    let orientation: 'up' | 'down' | 'left' | 'right';
    let openDirection: 'up' | 'down' | 'left' | 'right';

    if (equation.isVertical) {
      // y = ax² + bx + c
      const vertexX = -equation.b / (2 * equation.a);
      const vertexY = equation.a * vertexX * vertexX + equation.b * vertexX + equation.c;
      vertex = { x: vertexX, y: vertexY };

      orientation = equation.a > 0 ? 'up' : 'down';
      openDirection = orientation;
    } else {
      // x = ay² + by + c
      const vertexY = -equation.b / (2 * equation.a);
      const vertexX = equation.a * vertexY * vertexY + equation.b * vertexY + equation.c;
      vertex = { x: vertexX, y: vertexY };

      orientation = equation.a > 0 ? 'right' : 'left';
      openDirection = orientation;
    }

    // Calculate focus and directrix
    const p = 1 / (4 * Math.abs(equation.a)); // Distance from vertex to focus

    let focus: Point;
    let directrix: Line;

    if (equation.isVertical) {
      focus = {
        x: vertex.x,
        y: vertex.y + (equation.a > 0 ? p : -p),
      };
      directrix = {
        isVertical: false,
        value: vertex.y + (equation.a > 0 ? -p : p),
      };
    } else {
      focus = {
        x: vertex.x + (equation.a > 0 ? p : -p),
        y: vertex.y,
      };
      directrix = {
        isVertical: true,
        value: vertex.x + (equation.a > 0 ? -p : p),
      };
    }

    // Calculate symmetry
    const symmetry = this.calculateParabolaSymmetry(points, vertex, equation);

    // Validate that vertex is reasonable
    if (
      vertex.x < bbox.minX - bbox.width * 0.5 ||
      vertex.x > bbox.maxX + bbox.width * 0.5 ||
      vertex.y < bbox.minY - bbox.height * 0.5 ||
      vertex.y > bbox.maxY + bbox.height * 0.5
    ) {
      return null; // Vertex is too far from the actual stroke
    }

    return {
      vertex,
      focus,
      directrix,
      orientation,
      openDirection,
      symmetry,
    };
  }

  private calculateParabolaSymmetry(
    points: Point[],
    vertex: Point,
    equation: { a: number; b: number; c: number; isVertical: boolean },
  ): number {
    let matches = 0;
    let total = 0;

    const tolerance = 10; // Increased tolerance for hand-drawn curves
    const minDistanceFromVertex = 20; // Only check points away from vertex

    for (const point of points) {
      // Calculate distance from vertex
      const distFromVertex = Math.sqrt((point.x - vertex.x) ** 2 + (point.y - vertex.y) ** 2);

      // Skip points too close to vertex (tip area is less reliable for symmetry)
      if (distFromVertex < minDistanceFromVertex) continue;

      // Find the corresponding symmetric point
      let symmetricPoint: Point;

      if (equation.isVertical) {
        // Reflect across vertical line through vertex
        const dx = point.x - vertex.x;
        symmetricPoint = { x: vertex.x - dx, y: point.y };
      } else {
        // Reflect across horizontal line through vertex
        const dy = point.y - vertex.y;
        symmetricPoint = { x: point.x, y: vertex.y - dy };
      }

      // Check if this symmetric point is close to any actual point
      let closestDistance = Infinity;
      for (const otherPoint of points) {
        const dist = Math.sqrt(
          (symmetricPoint.x - otherPoint.x) ** 2 + (symmetricPoint.y - otherPoint.y) ** 2,
        );
        closestDistance = Math.min(closestDistance, dist);
      }

      if (closestDistance < tolerance) {
        matches++;
      }
      total++;
    }

    // If we don't have enough points to check, be lenient
    if (total < 5) return 0.5;

    return total > 0 ? matches / total : 0;
  }

  // Note: These methods are commented out as they're not currently used
  // but may be useful for future improvements to parabola detection

  // private validateParabolaShape(points: Point[], vertex: Point, equation: ParabolaEquation): boolean {
  //   // Check that the parabola opens in a consistent direction
  //   let pointsAboveVertex = 0;
  //   let pointsBelowVertex = 0;
  //   let pointsLeftOfVertex = 0;
  //   let pointsRightOfVertex = 0;

  //   for (const point of points) {
  //     if (point.y < vertex.y) pointsAboveVertex++;
  //     if (point.y > vertex.y) pointsBelowVertex++;
  //     if (point.x < vertex.x) pointsLeftOfVertex++;
  //     if (point.x > vertex.x) pointsRightOfVertex++;
  //   }

  //   if (equation.isVertical) {
  //     // For vertical parabolas, we should have points on both sides of the vertex horizontally
  //     // but concentrated on one side vertically (the opening direction)
  //     const horizontalBalance = Math.min(pointsLeftOfVertex, pointsRightOfVertex) / Math.max(pointsLeftOfVertex, pointsRightOfVertex);
  //     return horizontalBalance > 0.3; // At least 30% on each side
  //   } else {
  //     // For horizontal parabolas, we should have points on both sides of the vertex vertically
  //     // but concentrated on one side horizontally (the opening direction)
  //     const verticalBalance = Math.min(pointsAboveVertex, pointsBelowVertex) / Math.max(pointsAboveVertex, pointsBelowVertex);
  //     return verticalBalance > 0.3; // At least 30% on each side
  //   }
  // }

  // private calculateCurvatureConsistency(points: Point[]): number {
  //   if (points.length < 3) return 0;

  //   let curvatureChanges = 0;
  //   let previousCurvature: number | null = null;

  //   for (let i = 2; i < points.length; i++) {
  //     const p1 = points[i - 2];
  //     const p2 = points[i - 1];
  //     const p3 = points[i];

  //     // Calculate curvature at p2
  //     const v1x = p2.x - p1.x;
  //     const v1y = p2.y - p1.y;
  //     const v2x = p3.x - p2.x;
  //     const v2y = p3.y - p2.y;

  //     const cross = v1x * v2y - v1y * v2x;
  //     const dot = v1x * v2x + v1y * v2y;
  //     const curvature = Math.atan2(cross, dot);

  //     if (previousCurvature !== null) {
  //       // Check if curvature direction changed significantly
  //       if (Math.sign(curvature) !== Math.sign(previousCurvature) &&
  //           Math.abs(curvature) > Math.PI / 6 && Math.abs(previousCurvature) > Math.PI / 6) {
  //         curvatureChanges++;
  //       }
  //     }

  //     previousCurvature = curvature;
  //   }

  //   // Parabolas should have consistent curvature direction
  //   return 1 - (curvatureChanges / Math.max(1, points.length - 2));
  // }
}

interface ParabolaInfo {
  vertex: Point;
  focus: Point;
  directrix: Line;
  orientation: 'up' | 'down' | 'left' | 'right';
  openDirection: 'up' | 'down' | 'left' | 'right';
  symmetry: number;
}

interface Line {
  isVertical: boolean;
  value: number; // y-value for horizontal lines, x-value for vertical lines
}
