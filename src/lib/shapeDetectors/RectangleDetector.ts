/**
 * Rectangle detection algorithm
 */

import { Point, BoundingBox, distance, angleBetween, createVector } from '../geometry';
import { ProcessedStroke, analyzeStroke } from '../strokeProcessor';
import { ShapeDetector, DetectionResult, DetectionThresholds, createDetectedShape } from './types';

export class RectangleDetector implements ShapeDetector {
  readonly shapeType = 'rectangle';
  readonly priority = 6; // Higher than triangle and ellipse for geometric shapes

  detect(stroke: ProcessedStroke, thresholds: DetectionThresholds): DetectionResult | null {
    const points = stroke.processedPoints;
    
    // Quick rejection tests
    if (points.length < 4) {
      console.log(`Rectangle: REJECT - too few points: ${points.length} < 4`);
      return null;
    }
    if (!stroke.isClosed) {
      console.log(`Rectangle: REJECT - not closed`);
      return null; // Rectangles should be closed
    }
    
    const analysis = analyzeStroke(stroke);
    console.log(`Rectangle: Analysis - corners: ${analysis.cornerCount}, hasSharp: ${analysis.hasSharpCorners}, complexity: ${stroke.complexity.toFixed(3)}, straightRatio: ${analysis.straightSegmentRatio.toFixed(3)}`);
    
    // For shapes with good straight ratio, allow detection even without detected corners
    // This handles cases where hand-drawn rectangles have soft corners that don't register as "sharp"
    const requiresCorners = analysis.straightSegmentRatio < 0.55; // Only require corners for less geometric shapes
    
    if (requiresCorners) {
      // Normal case - require corners for less geometric shapes
      if (!analysis.hasSharpCorners || analysis.cornerCount < 3 || analysis.cornerCount > 6) {
        console.log(`Rectangle: REJECT - corner requirements not met: hasSharp=${analysis.hasSharpCorners}, count=${analysis.cornerCount} (required for straightRatio=${analysis.straightSegmentRatio.toFixed(3)} < 0.55)`);
        return null;
      }
    } else {
      // High straight ratio - allow detection without corners but limit excessive corners
      if (analysis.cornerCount > 12) {
        console.log(`Rectangle: REJECT - too many corners: count=${analysis.cornerCount} > 12`);
        return null;
      }
      console.log(`Rectangle: ACCEPT corners check - hasSharp=${analysis.hasSharpCorners}, count=${analysis.cornerCount}, requiresCorners=${requiresCorners}`);
    }
    
    // Should have significant straight segments - focus on ratio rather than the hasLongStraightSegments flag
    const requiredEdgeRatio = stroke.complexity > 0.1 ? thresholds.rectangleEdgeRatio : thresholds.rectangleEdgeRatio * 0.7;
    if (analysis.straightSegmentRatio < requiredEdgeRatio) {
      console.log(`Rectangle: REJECT - insufficient straight segments: ratio=${analysis.straightSegmentRatio.toFixed(3)} < ${requiredEdgeRatio.toFixed(3)} (hasLong=${analysis.hasLongStraightSegments})`);
      return null;
    }
    console.log(`Rectangle: ACCEPT straight segments - ratio=${analysis.straightSegmentRatio.toFixed(3)} >= ${requiredEdgeRatio.toFixed(3)}`);
    
    // Find the best rectangle fit
    const rectangleFit = this.findBestRectangleFit(points, stroke.boundingBox);
    if (!rectangleFit) {
      console.log(`Rectangle: REJECT - no rectangle fit found`);
      return null;
    }
    console.log(`Rectangle: Found fit`);
    
    // Calculate fitting error
    const error = this.calculateRectangleError(points, rectangleFit);
    const normalizedError = error / Math.max(stroke.boundingBox.width, stroke.boundingBox.height);
    
    console.log(`Rectangle: Found fit with error ${error.toFixed(3)}, normalized ${normalizedError.toFixed(3)}`);
    
    if (normalizedError > thresholds.rectangleMaxError) {
      console.log(`Rectangle: REJECT - error too high: ${normalizedError.toFixed(3)} > ${thresholds.rectangleMaxError}`);
      return null;
    }
    
    // Calculate confidence
    const edgeConfidence = analysis.straightSegmentRatio;
    const cornerConfidence = Math.min(1, analysis.cornerCount / 4);
    const errorConfidence = 1 - Math.min(1, normalizedError / thresholds.rectangleMaxError);
    const symmetryConfidence = analysis.symmetry;
    
    const confidence = (edgeConfidence + cornerConfidence + errorConfidence + symmetryConfidence) / 4;
    
    console.log(`Rectangle: Confidence calculation - edge=${edgeConfidence.toFixed(3)}, corner=${cornerConfidence.toFixed(3)}, error=${errorConfidence.toFixed(3)}, symmetry=${symmetryConfidence.toFixed(3)}, total=${confidence.toFixed(3)}`);
    
    if (confidence < thresholds.minConfidence) {
      console.log(`Rectangle: REJECT - confidence too low: ${confidence.toFixed(3)} < ${thresholds.minConfidence}`);
      return null;
    }
    
    console.log(`Rectangle: SUCCESS - rectangle detected with confidence ${confidence.toFixed(3)}, error ${normalizedError.toFixed(3)}`);
    
    // Create the detected shape
    const shape = createDetectedShape('rectangle', rectangleFit.boundingBox, {
      points: rectangleFit.corners,
      properties: {
        width: rectangleFit.boundingBox.width,
        height: rectangleFit.boundingBox.height,
        aspectRatio: rectangleFit.boundingBox.width / rectangleFit.boundingBox.height,
        rotation: rectangleFit.rotation,
        isSquare: this.isSquare(rectangleFit.boundingBox, thresholds.rectangleAspectRatioTolerance)
      }
    });
    
    return {
      confidence,
      shape,
      error: normalizedError,
      metadata: {
        analysis,
        rectangleFit
      }
    };
  }
  
  private findBestRectangleFit(points: Point[], bbox: BoundingBox): RectangleFit | null {
    // Try different approaches to find the best rectangle
    
    // Approach 1: Axis-aligned rectangle (most common)
    const axisAligned = this.fitAxisAlignedRectangle(points, bbox);
    
    // Approach 2: Corner-based rectangle (if we can find clear corners)
    const cornerBased = this.fitCornerBasedRectangle(points);
    
    // Approach 3: Edge-based rectangle (find dominant edges)
    const edgeBased = this.fitEdgeBasedRectangle(points);
    
    // Choose the best fit based on error
    const candidates = [axisAligned, cornerBased, edgeBased].filter(fit => fit !== null);
    if (candidates.length === 0) return null;
    
    return candidates.reduce((best, current) => {
      const bestError = this.calculateRectangleError(points, best);
      const currentError = this.calculateRectangleError(points, current);
      return currentError < bestError ? current : best;
    });
  }
  
  private fitAxisAlignedRectangle(_points: Point[], bbox: BoundingBox): RectangleFit {
    const corners: Point[] = [
      { x: bbox.minX, y: bbox.minY }, // Top-left
      { x: bbox.maxX, y: bbox.minY }, // Top-right
      { x: bbox.maxX, y: bbox.maxY }, // Bottom-right
      { x: bbox.minX, y: bbox.maxY }  // Bottom-left
    ];
    
    return {
      corners,
      boundingBox: bbox,
      rotation: 0
    };
  }
  
  private fitCornerBasedRectangle(points: Point[]): RectangleFit | null {
    const corners = this.findRectangleCorners(points);
    if (corners.length < 4) return null;
    
    // Sort corners to form a proper rectangle
    const sortedCorners = this.sortRectangleCorners(corners.slice(0, 4));
    
    // Calculate bounding box from corners
    const xs = sortedCorners.map(p => p.x);
    const ys = sortedCorners.map(p => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    
    const boundingBox: BoundingBox = {
      minX, minY, maxX, maxY,
      width: maxX - minX,
      height: maxY - minY,
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2
    };
    
    // Calculate rotation (angle of first edge)
    const edge1 = createVector(sortedCorners[0], sortedCorners[1]);
    const rotation = Math.atan2(edge1.y, edge1.x);
    
    return {
      corners: sortedCorners,
      boundingBox,
      rotation
    };
  }
  
  private fitEdgeBasedRectangle(points: Point[]): RectangleFit | null {
    // Find dominant edge directions
    const edges = this.findDominantEdges(points);
    if (edges.length < 2) return null;
    
    // Use the two most perpendicular edges
    const perpendicular = this.findMostPerpendicularEdges(edges);
    if (!perpendicular) return null;
    
    // Construct rectangle from these edges
    return this.constructRectangleFromEdges(points, perpendicular.edge1, perpendicular.edge2);
  }
  
  private findRectangleCorners(points: Point[]): Point[] {
    const corners: Point[] = [];
    const cornerThreshold = Math.PI / 3; // 60 degrees
    const minDistance = 10; // Minimum distance between corners
    
    for (let i = 1; i < points.length - 1; i++) {
      const p1 = points[i - 1];
      const p2 = points[i];
      const p3 = points[i + 1];
      
      const v1 = createVector(p2, p1);
      const v2 = createVector(p2, p3);
      
      if (v1.magnitude > 0 && v2.magnitude > 0) {
        const angle = angleBetween(v1, v2);
        
        // Check for corner angle
        if (angle < cornerThreshold) {
          // Check minimum distance from existing corners
          const tooClose = corners.some(corner => distance(corner, p2) < minDistance);
          if (!tooClose) {
            corners.push(p2);
          }
        }
      }
    }
    
    return corners;
  }
  
  private sortRectangleCorners(corners: Point[]): Point[] {
    if (corners.length !== 4) return corners;
    
    // Find center point
    const centerX = corners.reduce((sum, p) => sum + p.x, 0) / 4;
    const centerY = corners.reduce((sum, p) => sum + p.y, 0) / 4;
    
    // Sort by angle from center
    return corners.sort((a, b) => {
      const angleA = Math.atan2(a.y - centerY, a.x - centerX);
      const angleB = Math.atan2(b.y - centerY, b.x - centerX);
      return angleA - angleB;
    });
  }
  
  private findDominantEdges(points: Point[]): EdgeSegment[] {
    const edges: EdgeSegment[] = [];
    const minSegmentLength = 5;
    
    for (let i = 0; i < points.length - minSegmentLength; i++) {
      for (let j = i + minSegmentLength; j < points.length; j++) {
        const start = points[i];
        const end = points[j];
        const direction = createVector(start, end);
        
        if (direction.magnitude > minSegmentLength) {
          // Check how many points lie on this edge
          let pointsOnEdge = 0;
          const tolerance = 3;
          
          for (let k = i; k <= j; k++) {
            const distToEdge = this.distanceToLineSegment(points[k], start, end);
            if (distToEdge < tolerance) {
              pointsOnEdge++;
            }
          }
          
          const coverage = pointsOnEdge / (j - i + 1);
          if (coverage > 0.8) {
            edges.push({
              start,
              end,
              direction,
              coverage,
              length: direction.magnitude
            });
          }
        }
      }
    }
    
    // Sort by length and coverage
    return edges.sort((a, b) => (b.length * b.coverage) - (a.length * a.coverage));
  }
  
  private findMostPerpendicularEdges(edges: EdgeSegment[]): { edge1: EdgeSegment; edge2: EdgeSegment } | null {
    let bestPerpendicularity = 0;
    let bestPair: { edge1: EdgeSegment; edge2: EdgeSegment } | null = null;
    
    for (let i = 0; i < edges.length; i++) {
      for (let j = i + 1; j < edges.length; j++) {
        const angle = angleBetween(edges[i].direction, edges[j].direction);
        const perpendicularity = Math.abs(angle - Math.PI / 2);
        
        if (perpendicularity < Math.PI / 6 && angle > bestPerpendicularity) {
          bestPerpendicularity = angle;
          bestPair = { edge1: edges[i], edge2: edges[j] };
        }
      }
    }
    
    return bestPair;
  }
  
  private constructRectangleFromEdges(points: Point[], edge1: EdgeSegment, edge2: EdgeSegment): RectangleFit | null {
    // Construct a rotated rectangle from two perpendicular edges
    const dir1 = {
      x: edge1.direction.normalized.x,
      y: edge1.direction.normalized.y
    };
    const dir2 = {
      x: edge2.direction.normalized.x,
      y: edge2.direction.normalized.y
    };
    
    // Project all points onto both edge directions to find extent
    let min1 = Infinity, max1 = -Infinity;
    let min2 = Infinity, max2 = -Infinity;
    
    const center = {
      x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
      y: points.reduce((sum, p) => sum + p.y, 0) / points.length
    };
    
    for (const point of points) {
      const rel = { x: point.x - center.x, y: point.y - center.y };
      const proj1 = rel.x * dir1.x + rel.y * dir1.y;
      const proj2 = rel.x * dir2.x + rel.y * dir2.y;
      
      min1 = Math.min(min1, proj1);
      max1 = Math.max(max1, proj1);
      min2 = Math.min(min2, proj2);
      max2 = Math.max(max2, proj2);
    }
    
    // Construct corners from the projections
    const corners: Point[] = [
      { x: center.x + dir1.x * min1 + dir2.x * min2, y: center.y + dir1.y * min1 + dir2.y * min2 },
      { x: center.x + dir1.x * max1 + dir2.x * min2, y: center.y + dir1.y * max1 + dir2.y * min2 },
      { x: center.x + dir1.x * max1 + dir2.x * max2, y: center.y + dir1.y * max1 + dir2.y * max2 },
      { x: center.x + dir1.x * min1 + dir2.x * max2, y: center.y + dir1.y * min1 + dir2.y * max2 }
    ];
    
    // Calculate bounding box from corners
    const xs = corners.map(p => p.x);
    const ys = corners.map(p => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    
    const boundingBox: BoundingBox = {
      minX, minY, maxX, maxY,
      width: maxX - minX,
      height: maxY - minY,
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2
    };
    
    const rotation = Math.atan2(dir1.y, dir1.x);
    
    return {
      corners,
      boundingBox,
      rotation
    };
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
  
  private calculateRectangleError(points: Point[], rectangleFit: RectangleFit): number {
    let totalError = 0;
    const corners = rectangleFit.corners;
    
    // Calculate distance to nearest edge for each point
    for (const point of points) {
      let minDistance = Infinity;
      
      // Check distance to each edge of the rectangle
      for (let i = 0; i < corners.length; i++) {
        const start = corners[i];
        const end = corners[(i + 1) % corners.length];
        const dist = this.distanceToLineSegment(point, start, end);
        minDistance = Math.min(minDistance, dist);
      }
      
      totalError += minDistance;
    }
    
    return totalError / points.length;
  }
  
  private isSquare(bbox: BoundingBox, tolerance: number): boolean {
    const aspectRatio = bbox.width / bbox.height;
    return Math.abs(aspectRatio - 1) < tolerance;
  }
}

interface RectangleFit {
  corners: Point[];
  boundingBox: BoundingBox;
  rotation: number;
}

interface EdgeSegment {
  start: Point;
  end: Point;
  direction: { x: number; y: number; magnitude: number; normalized: { x: number; y: number; magnitude: number; normalized: any } };
  coverage: number;
  length: number;
}
