/**
 * Triangle detection algorithm
 */

import { Point, BoundingBox, distance, angleBetween, createVector } from '../geometry';
import { ProcessedStroke, analyzeStroke } from '../strokeProcessor';
import { ShapeDetector, DetectionResult, DetectionThresholds, createDetectedShape } from './types';

export class TriangleDetector implements ShapeDetector {
  readonly shapeType = 'triangle';
  readonly priority = 5; // Higher than ellipse to prioritize triangular shapes

  detect(stroke: ProcessedStroke, thresholds: DetectionThresholds): DetectionResult | null {
    const points = stroke.processedPoints;
    
    // Quick rejection tests
    if (points.length < 6) {
      console.log(`Triangle: REJECT - too few points: ${points.length} < 6`);
      return null;
    }
    if (!stroke.isClosed) {
      console.log(`Triangle: REJECT - not closed`);
      return null; // Triangles should be closed
    }
    
    const analysis = analyzeStroke(stroke);
    console.log(`Triangle: Analysis - corners: ${analysis.cornerCount}, hasSharp: ${analysis.hasSharpCorners}, straightRatio: ${analysis.straightSegmentRatio.toFixed(3)}`);
    
    // Should have corners for a triangle but be very flexible for hand-drawn shapes
    // For shapes with good straight ratio (>0.55), allow detection even without detected corners
    // This handles cases where hand-drawn triangles have soft corners that don't register as "sharp"
    const maxCorners = analysis.straightSegmentRatio > 0.7 ? 30 : 20;
    const requiresCorners = analysis.straightSegmentRatio < 0.55; // Only require corners for less geometric shapes
    
    if (requiresCorners && (!analysis.hasSharpCorners || analysis.cornerCount < 2)) {
      console.log(`Triangle: REJECT - corner requirements not met: hasSharp=${analysis.hasSharpCorners}, count=${analysis.cornerCount} (required for straightRatio=${analysis.straightSegmentRatio.toFixed(3)} < 0.55)`);
      return null;
    }
    
    if (analysis.cornerCount > maxCorners) {
      console.log(`Triangle: REJECT - too many corners: count=${analysis.cornerCount} > ${maxCorners}`);
      return null;
    }
    
    console.log(`Triangle: ACCEPT corners check - hasSharp=${analysis.hasSharpCorners}, count=${analysis.cornerCount}, requiresCorners=${requiresCorners}`);
    
    // Should have significant straight segments
    if (!analysis.hasLongStraightSegments || analysis.straightSegmentRatio < thresholds.triangleEdgeRatio) {
      console.log(`Triangle: REJECT - insufficient straight segments: hasLong=${analysis.hasLongStraightSegments}, ratio=${analysis.straightSegmentRatio.toFixed(3)} < ${thresholds.triangleEdgeRatio}`);
      return null;
    }
    
    // Find the best triangle fit
    const triangleFit = this.findBestTriangleFit(points, analysis);
    if (!triangleFit) {
      console.log(`Triangle: REJECT - no valid triangle fit found`);
      return null;
    }
    
    // Calculate fitting error first
    const error = this.calculateTriangleError(points, triangleFit);
    console.log(`Triangle: Found fit with error ${error.toFixed(3)}`);
    
    // Validate that it's actually triangle-like
    if (!this.validateTriangle(triangleFit)) {
      console.log(`Triangle: REJECT - failed triangle validation`);
      return null;
    }
    
    // Calculate normalized error
    const normalizedError = error / Math.max(stroke.boundingBox.width, stroke.boundingBox.height);
    
    if (normalizedError > thresholds.triangleMaxError) {
      console.log(`Triangle: REJECT - error too high: ${normalizedError.toFixed(3)} > ${thresholds.triangleMaxError}`);
      return null;
    }
    
    // Calculate confidence
    const cornerConfidence = this.calculateCornerConfidence(analysis.cornerCount);
    const edgeConfidence = analysis.straightSegmentRatio;
    const errorConfidence = 1 - Math.min(1, normalizedError / thresholds.triangleMaxError);
    const shapeConfidence = this.calculateShapeConfidence(triangleFit);
    
    const confidence = (cornerConfidence + edgeConfidence + errorConfidence + shapeConfidence) / 4;
    
    if (confidence < thresholds.minConfidence) {
      console.log(`Triangle: REJECT - confidence too low: ${confidence.toFixed(3)} < ${thresholds.minConfidence}`);
      return null;
    }
    
    console.log(`Triangle: SUCCESS - triangle detected with confidence ${confidence.toFixed(3)}, error ${normalizedError.toFixed(3)}`);
    
    // Create the detected shape
    const shape = createDetectedShape('triangle', this.getTriangleBoundingBox(triangleFit.vertices), {
      points: triangleFit.vertices,
      center: triangleFit.centroid,
      properties: {
        vertices: triangleFit.vertices,
        edges: triangleFit.edges,
        angles: triangleFit.angles,
        area: triangleFit.area,
        perimeter: triangleFit.perimeter,
        triangleType: this.classifyTriangle(triangleFit)
      }
    });
    
    return {
      confidence,
      shape,
      error: normalizedError,
      metadata: {
        analysis,
        triangleFit
      }
    };
  }
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private findBestTriangleFit(points: Point[], analysis: any): TriangleFit | null {
    // Try different approaches to find triangle vertices
    
    // Approach 1: Use detected corners
    const cornerBased = this.fitTriangleFromCorners(analysis.corners);
    
    // Approach 2: Find vertices by maximum distance
    const distanceBased = this.fitTriangleByDistance(points);
    
    // Approach 3: Use convex hull approach
    const convexHullBased = this.fitTriangleFromConvexHull(points);
    
    // Approach 4: Try to fit a right triangle specifically
    const rightTriangleBased = this.fitRightTriangle(points);
    
    // Choose the best fit
    const candidates = [cornerBased, distanceBased, convexHullBased, rightTriangleBased].filter(fit => fit !== null);
    if (candidates.length === 0) return null;
    
    return candidates.reduce((best, current) => {
      const bestError = this.calculateTriangleError(points, best);
      const currentError = this.calculateTriangleError(points, current);
      return currentError < bestError ? current : best;
    });
  }
  
  private fitRightTriangle(points: Point[]): TriangleFit | null {
    if (points.length < 3) return null;
    
    // Strategy: Use a smarter approach to find right triangles
    // 1. Find extremal points (corners of bounding box)
    // 2. Test combinations of extremal points + other candidate points
    
    // Find extremal points
    const extremals = this.findExtremalPoints(points);
    
    // Add some well-distributed sample points
    const step = Math.max(1, Math.floor(points.length / 10));
    const samples = points.filter((_, i) => i % step === 0);
    
    // Combine extremal and sample points
    const candidates = [...extremals, ...samples];
    const uniqueCandidates = this.deduplicatePoints(candidates, 5); // Remove points within 5px of each other
    
    let bestFit: TriangleFit | null = null;
    let bestScore = 0; // Higher is better (combination of right angle quality and fit)
    
    // Try combinations of candidate points - limited to reasonable number
    const maxCandidates = Math.min(uniqueCandidates.length, 15);
    for (let i = 0; i < maxCandidates - 2; i++) {
      for (let j = i + 1; j < maxCandidates - 1; j++) {
        for (let k = j + 1; k < maxCandidates; k++) {
          const vertices = [uniqueCandidates[i], uniqueCandidates[j], uniqueCandidates[k]];
          const fit = this.createTriangleFit(vertices);
          
          if (!fit || fit.area < 1000) continue;
          
          // Check if any angle is close to 90 degrees
          const rightAngle = Math.PI / 2;
          const minDeviation = Math.min(
            Math.abs(fit.angles[0] - rightAngle),
            Math.abs(fit.angles[1] - rightAngle),
            Math.abs(fit.angles[2] - rightAngle)
          );
          
          // Score combines right-angle quality and error
          const rightAngleQuality = Math.max(0, 1 - minDeviation / (Math.PI / 6)); // 0-1, 1 is perfect
          const error = this.calculateTriangleError(points, fit);
          const errorQuality = 1 / (1 + error); // Lower error = higher quality
          const score = rightAngleQuality * 0.7 + errorQuality * 0.3;
          
          if (score > bestScore && minDeviation < Math.PI / 6) { // Within 30 degrees of 90°
            bestScore = score;
            bestFit = fit;
          }
        }
      }
    }
    
    // Only return if we found a good right triangle
    if (bestFit && bestScore > 0.5) {
      return bestFit;
    }
    
    return null;
  }
  
  private findExtremalPoints(points: Point[]): Point[] {
    if (points.length === 0) return [];
    
    let minX = points[0], maxX = points[0];
    let minY = points[0], maxY = points[0];
    
    for (const point of points) {
      if (point.x < minX.x) minX = point;
      if (point.x > maxX.x) maxX = point;
      if (point.y < minY.y) minY = point;
      if (point.y > maxY.y) maxY = point;
    }
    
    return [minX, maxX, minY, maxY];
  }
  
  private deduplicatePoints(points: Point[], threshold: number): Point[] {
    const unique: Point[] = [];
    
    for (const point of points) {
      const isDuplicate = unique.some(p => distance(p, point) < threshold);
      if (!isDuplicate) {
        unique.push(point);
      }
    }
    
    return unique;
  }
  
  private fitTriangleFromCorners(corners: Point[]): TriangleFit | null {
    if (corners.length < 3) return null;
    
    // If we have more than 3 corners, choose the 3 most prominent ones
    let vertices: Point[];
    if (corners.length === 3) {
      vertices = corners;
    } else {
      // Choose 3 corners that form the largest triangle
      vertices = this.selectBestTriangleVertices(corners);
    }
    
    return this.createTriangleFit(vertices);
  }
  
  private fitTriangleByDistance(points: Point[]): TriangleFit | null {
    if (points.length < 3) return null;
    
    // Find three points that are maximally separated
    let maxDistance = 0;
    let vertex1: Point | null = null;
    let vertex2: Point | null = null;
    
    // Find the two points that are farthest apart
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const dist = distance(points[i], points[j]);
        if (dist > maxDistance) {
          maxDistance = dist;
          vertex1 = points[i];
          vertex2 = points[j];
        }
      }
    }
    
    if (!vertex1 || !vertex2) return null;
    
    // Find the third vertex that is farthest from the line between vertex1 and vertex2
    let maxDistanceToLine = 0;
    let vertex3: Point | null = null;
    
    for (const point of points) {
      if (point === vertex1 || point === vertex2) continue;
      
      const distToLine = this.distanceToLine(point, vertex1, vertex2);
      if (distToLine > maxDistanceToLine) {
        maxDistanceToLine = distToLine;
        vertex3 = point;
      }
    }
    
    if (!vertex3) return null;
    
    return this.createTriangleFit([vertex1, vertex2, vertex3]);
  }
  
  private fitTriangleFromConvexHull(points: Point[]): TriangleFit | null {
    // Simplified convex hull approach
    const hull = this.simpleConvexHull(points);
    
    if (hull.length < 3) return null;
    if (hull.length === 3) return this.createTriangleFit(hull);
    
    // If hull has more than 3 points, find the best triangle approximation
    return this.approximateTriangleFromHull(hull);
  }
  
  private selectBestTriangleVertices(corners: Point[]): Point[] {
    let bestArea = 0;
    let bestVertices: Point[] = corners.slice(0, 3);
    
    // Try all combinations of 3 corners
    for (let i = 0; i < corners.length - 2; i++) {
      for (let j = i + 1; j < corners.length - 1; j++) {
        for (let k = j + 1; k < corners.length; k++) {
          const vertices = [corners[i], corners[j], corners[k]];
          const area = this.calculateTriangleArea(vertices);
          
          if (area > bestArea) {
            bestArea = area;
            bestVertices = vertices;
          }
        }
      }
    }
    
    return bestVertices;
  }
  
  private createTriangleFit(vertices: Point[]): TriangleFit | null {
    if (vertices.length !== 3) return null;
    
    // Ensure vertices are in proper order (counter-clockwise)
    const orderedVertices = this.orderVerticesCounterClockwise(vertices);
    
    // Calculate edges
    const edges = [
      { start: orderedVertices[0], end: orderedVertices[1], length: distance(orderedVertices[0], orderedVertices[1]) },
      { start: orderedVertices[1], end: orderedVertices[2], length: distance(orderedVertices[1], orderedVertices[2]) },
      { start: orderedVertices[2], end: orderedVertices[0], length: distance(orderedVertices[2], orderedVertices[0]) }
    ];
    
    // Calculate angles
    const angles = [
      this.calculateAngleAtVertex(orderedVertices[0], orderedVertices[1], orderedVertices[2]),
      this.calculateAngleAtVertex(orderedVertices[1], orderedVertices[2], orderedVertices[0]),
      this.calculateAngleAtVertex(orderedVertices[2], orderedVertices[0], orderedVertices[1])
    ];
    
    // Calculate centroid
    const centroid = {
      x: (orderedVertices[0].x + orderedVertices[1].x + orderedVertices[2].x) / 3,
      y: (orderedVertices[0].y + orderedVertices[1].y + orderedVertices[2].y) / 3
    };
    
    // Calculate area and perimeter
    const area = this.calculateTriangleArea(orderedVertices);
    const perimeter = edges.reduce((sum, edge) => sum + edge.length, 0);
    
    return {
      vertices: orderedVertices,
      edges,
      angles,
      centroid,
      area,
      perimeter
    };
  }
  
  private orderVerticesCounterClockwise(vertices: Point[]): Point[] {
    // Calculate centroid
    const cx = (vertices[0].x + vertices[1].x + vertices[2].x) / 3;
    const cy = (vertices[0].y + vertices[1].y + vertices[2].y) / 3;
    
    // Sort by angle from centroid
    return vertices.sort((a, b) => {
      const angleA = Math.atan2(a.y - cy, a.x - cx);
      const angleB = Math.atan2(b.y - cy, b.x - cx);
      return angleA - angleB;
    });
  }
  
  private calculateAngleAtVertex(vertex: Point, prev: Point, next: Point): number {
    const v1 = createVector(vertex, prev);
    const v2 = createVector(vertex, next);
    return angleBetween(v1, v2);
  }
  
  private calculateTriangleArea(vertices: Point[]): number {
    if (vertices.length !== 3) return 0;
    
    const [a, b, c] = vertices;
    return Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2;
  }
  
  private validateTriangle(triangle: TriangleFit): boolean {
    // Check that all angles are reasonable for a triangle
    const angleSum = triangle.angles.reduce((sum, angle) => sum + angle, 0);
    const expectedSum = Math.PI;
    const angleTolerance = Math.PI * 0.2; // 20% tolerance
    
    if (Math.abs(angleSum - expectedSum) > angleTolerance) return false;
    
    // Check that no angle is too small or too large
    const minAngle = Math.min(...triangle.angles);
    const maxAngle = Math.max(...triangle.angles);
    
    if (minAngle < Math.PI / 18 || maxAngle > Math.PI * 0.9) return false; // 10° to 162°
    
    // Check that the area is reasonable
    if (triangle.area < 100) return false; // Minimum area threshold
    
    return true;
  }
  
  private calculateTriangleError(points: Point[], triangle: TriangleFit): number {
    let totalError = 0;
    
    for (const point of points) {
      // Find minimum distance to any edge of the triangle
      let minDistance = Infinity;
      
      for (const edge of triangle.edges) {
        const dist = this.distanceToLineSegment(point, edge.start, edge.end);
        minDistance = Math.min(minDistance, dist);
      }
      
      totalError += minDistance;
    }
    
    return totalError / points.length;
  }
  
  private calculateCornerConfidence(cornerCount: number): number {
    // Optimal is 3 corners, confidence decreases as we deviate
    if (cornerCount === 3) return 1.0;
    if (cornerCount === 2 || cornerCount === 4) return 0.8;
    if (cornerCount === 1 || cornerCount === 5) return 0.6;
    return 0.3;
  }
  
  private calculateShapeConfidence(triangle: TriangleFit): number {
    // Check how "triangle-like" the shape is
    
    // Angle distribution confidence
    const angles = triangle.angles;
    const expectedSum = Math.PI;
    const actualSum = angles.reduce((sum, angle) => sum + angle, 0);
    const sumConfidence = 1 - Math.abs(actualSum - expectedSum) / expectedSum;
    
    // Edge ratio confidence (triangles shouldn't have one edge much longer than others)
    const edgeLengths = triangle.edges.map(e => e.length);
    const minEdge = Math.min(...edgeLengths);
    const maxEdge = Math.max(...edgeLengths);
    const ratioConfidence = minEdge / maxEdge; // 1 = equilateral, lower = more uneven
    
    return (sumConfidence + ratioConfidence) / 2;
  }
  
  private classifyTriangle(triangle: TriangleFit): string {
    const edges = triangle.edges.map(e => e.length);
    const angles = triangle.angles;
    
    // Sort edges for easier comparison
    const sortedEdges = [...edges].sort((a, b) => a - b);
    const [a, b, c] = sortedEdges;
    
    const lengthTolerance = 0.1; // 10% tolerance for edge lengths
    const angleTolerance = Math.PI / 18; // 10 degrees tolerance for angles
    
    // First, check for right triangle by angle
    const rightAngle = Math.PI / 2;
    const hasRightAngle = angles.some(angle => Math.abs(angle - rightAngle) < angleTolerance);
    
    // Also check using Pythagorean theorem: a² + b² ≈ c²
    const pythagoreanCheck = Math.abs(a * a + b * b - c * c);
    const pythagoreanTolerance = c * c * 0.15; // 15% tolerance
    const isPythagorean = pythagoreanCheck < pythagoreanTolerance;
    
    // Check if edges are equal
    const abEqual = Math.abs(a - b) / Math.max(a, b) < lengthTolerance;
    const bcEqual = Math.abs(b - c) / Math.max(b, c) < lengthTolerance;
    const acEqual = Math.abs(a - c) / Math.max(a, c) < lengthTolerance;
    
    // Classification priority:
    // 1. Equilateral (all sides equal)
    if (abEqual && bcEqual) {
      return 'equilateral';
    }
    
    // 2. Right triangle (has 90° angle or satisfies Pythagorean theorem)
    if (hasRightAngle || isPythagorean) {
      // Check if it's also isosceles
      if (abEqual || bcEqual || acEqual) {
        return 'right-isosceles';
      }
      return 'right';
    }
    
    // 3. Isosceles (two sides equal)
    if (abEqual || bcEqual || acEqual) {
      return 'isosceles';
    }
    
    // 4. Scalene (no special properties)
    return 'scalene';
  }
  
  private getTriangleBoundingBox(vertices: Point[]): BoundingBox {
    const xs = vertices.map(v => v.x);
    const ys = vertices.map(v => v.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    
    return {
      minX, minY, maxX, maxY,
      width: maxX - minX,
      height: maxY - minY,
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2
    };
  }
  
  private distanceToLine(point: Point, lineStart: Point, lineEnd: Point): number {
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;
    
    if (dx === 0 && dy === 0) {
      return distance(point, lineStart);
    }
    
    const lineLengthSquared = dx * dx + dy * dy;
    const numerator = Math.abs(dy * point.x - dx * point.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x);
    
    return numerator / Math.sqrt(lineLengthSquared);
  }
  
  private distanceToLineSegment(point: Point, lineStart: Point, lineEnd: Point): number {
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;
    
    if (dx === 0 && dy === 0) {
      return distance(point, lineStart);
    }
    
    const t = ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / (dx * dx + dy * dy);
    const clampedT = Math.max(0, Math.min(1, t));
    
    const projection = {
      x: lineStart.x + clampedT * dx,
      y: lineStart.y + clampedT * dy
    };
    
    return distance(point, projection);
  }
  
  private simpleConvexHull(points: Point[]): Point[] {
    // Simplified convex hull using gift wrapping algorithm
    if (points.length < 3) return points;
    
    // Find the bottommost point (or leftmost in case of tie)
    let start = points[0];
    for (const point of points) {
      if (point.y < start.y || (point.y === start.y && point.x < start.x)) {
        start = point;
      }
    }
    
    const hull: Point[] = [];
    let current = start;
    
    do {
      hull.push(current);
      let next = points[0];
      
      for (const point of points) {
        if (point === current) continue;
        
        const cross = this.crossProduct(current, next, point);
        if (next === current || cross > 0 || (cross === 0 && distance(current, point) > distance(current, next))) {
          next = point;
        }
      }
      
      current = next;
    } while (current !== start && hull.length < points.length);
    
    return hull;
  }
  
  private crossProduct(a: Point, b: Point, c: Point): number {
    return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  }
  
  private approximateTriangleFromHull(hull: Point[]): TriangleFit | null {
    if (hull.length < 3) return null;
    
    // Find the 3 points in the hull that form the best triangle approximation
    // This is a simplified approach - in practice you might want more sophisticated methods
    
    let bestVertices: Point[] = hull.slice(0, 3);
    let bestScore = 0;
    
    for (let i = 0; i < hull.length - 2; i++) {
      for (let j = i + 1; j < hull.length - 1; j++) {
        for (let k = j + 1; k < hull.length; k++) {
          const vertices = [hull[i], hull[j], hull[k]];
          const area = this.calculateTriangleArea(vertices);
          
          // Score based on area (larger triangles are generally better approximations)
          if (area > bestScore) {
            bestScore = area;
            bestVertices = vertices;
          }
        }
      }
    }
    
    return this.createTriangleFit(bestVertices);
  }
}

interface TriangleFit {
  vertices: Point[];
  edges: Array<{ start: Point; end: Point; length: number }>;
  angles: number[];
  centroid: Point;
  area: number;
  perimeter: number;
}
