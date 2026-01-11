/**
 * Comprehensive geometry utilities for 2D shape detection and analysis
 */

export interface Point {
  x: number;
  y: number;
}

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

export interface Vector2D {
  x: number;
  y: number;
  magnitude: number;
  normalized: Vector2D;
}

// === Point Operations ===

export function distance(p1: Point, p2: Point): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function distanceSquared(p1: Point, p2: Point): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return dx * dx + dy * dy;
}

export function midpoint(p1: Point, p2: Point): Point {
  return {
    x: (p1.x + p2.x) / 2,
    y: (p1.y + p2.y) / 2
  };
}

// === Vector Operations ===

export function createVector(p1: Point, p2: Point): Vector2D {
  const x = p2.x - p1.x;
  const y = p2.y - p1.y;
  const magnitude = Math.sqrt(x * x + y * y);
  
  return {
    x,
    y,
    magnitude,
    normalized: magnitude > 0 ? { x: x / magnitude, y: y / magnitude, magnitude: 1, normalized: { x: x / magnitude, y: y / magnitude, magnitude: 1, normalized: {} as Vector2D } } : { x: 0, y: 0, magnitude: 0, normalized: {} as Vector2D }
  };
}

export function dotProduct(v1: Vector2D, v2: Vector2D): number {
  return v1.x * v2.x + v1.y * v2.y;
}

export function crossProduct(v1: Vector2D, v2: Vector2D): number {
  return v1.x * v2.y - v1.y * v2.x;
}

export function angleBetween(v1: Vector2D, v2: Vector2D): number {
  const dot = dotProduct(v1.normalized, v2.normalized);
  const clamped = Math.max(-1, Math.min(1, dot));
  return Math.acos(clamped);
}

export function vectorAngle(v: Vector2D): number {
  return Math.atan2(v.y, v.x);
}

// === Distance to Line/Curve ===

export function distanceToLine(point: Point, lineStart: Point, lineEnd: Point): number {
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

export function distanceToLineInfinite(point: Point, lineStart: Point, lineEnd: Point): number {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  
  if (dx === 0 && dy === 0) {
    return distance(point, lineStart);
  }
  
  const lineLengthSquared = dx * dx + dy * dy;
  const numerator = Math.abs(dy * point.x - dx * point.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x);
  
  return numerator / Math.sqrt(lineLengthSquared);
}

// === Bounding Box Operations ===

export function getBoundingBox(points: Point[]): BoundingBox {
  if (points.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0, centerX: 0, centerY: 0 };
  }
  
  let minX = points[0].x;
  let minY = points[0].y;
  let maxX = points[0].x;
  let maxY = points[0].y;
  
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  
  const width = maxX - minX;
  const height = maxY - minY;
  
  return {
    minX,
    minY,
    maxX,
    maxY,
    width,
    height,
    centerX: minX + width / 2,
    centerY: minY + height / 2
  };
}

// === Curve Analysis ===

export function calculateCurvature(points: Point[]): number {
  if (points.length < 3) return 0;
  
  let totalCurvature = 0;
  
  for (let i = 1; i < points.length - 1; i++) {
    const p1 = points[i - 1];
    const p2 = points[i];
    const p3 = points[i + 1];
    
    const v1 = createVector(p1, p2);
    const v2 = createVector(p2, p3);
    
    if (v1.magnitude > 0 && v2.magnitude > 0) {
      const angle = angleBetween(v1, v2);
      totalCurvature += angle;
    }
  }
  
  return totalCurvature;
}

export function calculateTotalPathLength(points: Point[]): number {
  if (points.length < 2) return 0;
  
  let totalLength = 0;
  for (let i = 1; i < points.length; i++) {
    totalLength += distance(points[i - 1], points[i]);
  }
  
  return totalLength;
}

// === Path Smoothing & Resampling ===

export function resamplePath(points: Point[], stepSize: number): Point[] {
  if (points.length < 2 || stepSize <= 0) return points;
  
  const result: Point[] = [points[0]];
  let currentDistance = 0;
  
  for (let i = 1; i < points.length; i++) {
    const segmentLength = distance(points[i - 1], points[i]);
    
    if (currentDistance + segmentLength >= stepSize) {
      // Add resampled point
      const remaining = stepSize - currentDistance;
      const ratio = remaining / segmentLength;
      
      const newPoint = {
        x: points[i - 1].x + ratio * (points[i].x - points[i - 1].x),
        y: points[i - 1].y + ratio * (points[i].y - points[i - 1].y)
      };
      
      result.push(newPoint);
      currentDistance = 0;
      
      // Continue with remaining segment
      const remainingSegment = segmentLength - remaining;
      if (remainingSegment >= stepSize) {
        // Recursively handle the rest of this segment
        const partialPath = [newPoint, points[i]];
        const recursiveResult = resamplePath(partialPath, stepSize);
        result.push(...recursiveResult.slice(1)); // Skip the first point (duplicate)
        currentDistance = 0;
      } else {
        currentDistance = remainingSegment;
      }
    } else {
      currentDistance += segmentLength;
    }
  }
  
  // Ensure we include the last point if it's significant
  const lastResult = result[result.length - 1];
  const lastOriginal = points[points.length - 1];
  if (distance(lastResult, lastOriginal) > stepSize * 0.1) {
    result.push(lastOriginal);
  }
  
  return result;
}

export function smoothPath(points: Point[], windowSize: number = 3): Point[] {
  if (points.length <= windowSize || windowSize < 3) return points;
  
  const result: Point[] = [];
  const halfWindow = Math.floor(windowSize / 2);
  
  for (let i = 0; i < points.length; i++) {
    const start = Math.max(0, i - halfWindow);
    const end = Math.min(points.length - 1, i + halfWindow);
    
    let sumX = 0;
    let sumY = 0;
    let count = 0;
    
    for (let j = start; j <= end; j++) {
      sumX += points[j].x;
      sumY += points[j].y;
      count++;
    }
    
    result.push({
      x: sumX / count,
      y: sumY / count
    });
  }
  
  return result;
}

// === Shape-specific Utilities ===

export function isClosedPath(points: Point[], tolerance: number): boolean {
  if (points.length < 3) return false;
  return distance(points[0], points[points.length - 1]) <= tolerance;
}

export function findCorners(points: Point[], angleThreshold: number = Math.PI / 3): Point[] {
  if (points.length < 3) return [];
  
  const corners: Point[] = [];
  
  for (let i = 1; i < points.length - 1; i++) {
    const p1 = points[i - 1];
    const p2 = points[i];
    const p3 = points[i + 1];
    
    const v1 = createVector(p2, p1);
    const v2 = createVector(p2, p3);
    
    const angle = angleBetween(v1, v2);
    
    if (angle < angleThreshold) {
      corners.push(p2);
    }
  }
  
  return corners;
}

// === Least Squares Fitting ===

export interface LineEquation {
  slope: number;
  intercept: number;
  isVertical: boolean;
  x?: number; // For vertical lines
}

export function fitLine(points: Point[]): LineEquation | null {
  if (points.length < 2) return null;
  
  // Check if line is more vertical than horizontal
  const bbox = getBoundingBox(points);
  const isMoreVertical = bbox.height > bbox.width;
  
  if (isMoreVertical) {
    // Fit x = slope * y + intercept
    let sumY = 0, sumX = 0, sumYY = 0, sumYX = 0;
    
    for (const point of points) {
      sumY += point.y;
      sumX += point.x;
      sumYY += point.y * point.y;
      sumYX += point.y * point.x;
    }
    
    const n = points.length;
    const denominator = n * sumYY - sumY * sumY;
    
    if (Math.abs(denominator) < 1e-10) {
      return { slope: 0, intercept: sumX / n, isVertical: true, x: sumX / n };
    }
    
    const slope = (n * sumYX - sumY * sumX) / denominator;
    const intercept = (sumX - slope * sumY) / n;
    
    return { slope, intercept, isVertical: true };
  } else {
    // Fit y = slope * x + intercept
    let sumX = 0, sumY = 0, sumXX = 0, sumXY = 0;
    
    for (const point of points) {
      sumX += point.x;
      sumY += point.y;
      sumXX += point.x * point.x;
      sumXY += point.x * point.y;
    }
    
    const n = points.length;
    const denominator = n * sumXX - sumX * sumX;
    
    if (Math.abs(denominator) < 1e-10) {
      return { slope: 0, intercept: sumY / n, isVertical: false };
    }
    
    const slope = (n * sumXY - sumX * sumY) / denominator;
    const intercept = (sumY - slope * sumX) / n;
    
    return { slope, intercept, isVertical: false };
  }
}

export interface ParabolaEquation {
  a: number;
  b: number;
  c: number;
  isVertical: boolean; // true for y = ax² + bx + c, false for x = ay² + by + c
}

export function fitParabola(points: Point[]): ParabolaEquation | null {
  if (points.length < 3) return null;
  
  const bbox = getBoundingBox(points);
  const isMoreVertical = bbox.height > bbox.width;
  
  if (isMoreVertical) {
    // Fit y = ax² + bx + c (vertical parabola opening up/down)
    let sumX = 0, sumY = 0, sumX2 = 0, sumX3 = 0, sumX4 = 0, sumXY = 0, sumX2Y = 0;
    
    for (const point of points) {
      const x = point.x;
      const y = point.y;
      const x2 = x * x;
      
      sumX += x;
      sumY += y;
      sumX2 += x2;
      sumX3 += x2 * x;
      sumX4 += x2 * x2;
      sumXY += x * y;
      sumX2Y += x2 * y;
    }
    
    const n = points.length;
    
    // Solve the normal equations using Cramer's rule
    const det = n * (sumX2 * sumX4 - sumX3 * sumX3) - sumX * (sumX * sumX4 - sumX2 * sumX3) + sumX2 * (sumX * sumX3 - sumX2 * sumX2);
    
    if (Math.abs(det) < 1e-10) return null;
    
    const detA = sumY * (sumX2 * sumX4 - sumX3 * sumX3) - sumXY * (sumX * sumX4 - sumX2 * sumX3) + sumX2Y * (sumX * sumX3 - sumX2 * sumX2);
    const detB = n * (sumXY * sumX4 - sumX2Y * sumX3) - sumY * (sumX * sumX4 - sumX2 * sumX3) + sumX2 * (sumX * sumX2Y - sumX2 * sumXY);
    const detC = n * (sumX2 * sumX2Y - sumX3 * sumXY) - sumX * (sumX * sumX2Y - sumX2 * sumXY) + sumY * (sumX * sumX3 - sumX2 * sumX2);
    
    return {
      a: detA / det,
      b: detB / det,
      c: detC / det,
      isVertical: true
    };
  } else {
    // Fit x = ay² + by + c (horizontal parabola opening left/right)
    let sumY = 0, sumX = 0, sumY2 = 0, sumY3 = 0, sumY4 = 0, sumYX = 0, sumY2X = 0;
    
    for (const point of points) {
      const x = point.x;
      const y = point.y;
      const y2 = y * y;
      
      sumY += y;
      sumX += x;
      sumY2 += y2;
      sumY3 += y2 * y;
      sumY4 += y2 * y2;
      sumYX += y * x;
      sumY2X += y2 * x;
    }
    
    const n = points.length;
    
    const det = n * (sumY2 * sumY4 - sumY3 * sumY3) - sumY * (sumY * sumY4 - sumY2 * sumY3) + sumY2 * (sumY * sumY3 - sumY2 * sumY2);
    
    if (Math.abs(det) < 1e-10) return null;
    
    const detA = sumX * (sumY2 * sumY4 - sumY3 * sumY3) - sumYX * (sumY * sumY4 - sumY2 * sumY3) + sumY2X * (sumY * sumY3 - sumY2 * sumY2);
    const detB = n * (sumYX * sumY4 - sumY2X * sumY3) - sumX * (sumY * sumY4 - sumY2 * sumY3) + sumY2 * (sumY * sumY2X - sumY2 * sumYX);
    const detC = n * (sumY2 * sumY2X - sumY3 * sumYX) - sumY * (sumY * sumY2X - sumY2 * sumYX) + sumX * (sumY * sumY3 - sumY2 * sumY2);
    
    return {
      a: detA / det,
      b: detB / det,
      c: detC / det,
      isVertical: false
    };
  }
}

// === Error Calculation ===

export function calculateLineError(points: Point[], line: LineEquation): number {
  let totalError = 0;
  
  for (const point of points) {
    let error: number;
    
    if (line.isVertical && line.x !== undefined) {
      error = Math.abs(point.x - line.x);
    } else {
      const expectedY = line.slope * point.x + line.intercept;
      error = Math.abs(point.y - expectedY);
    }
    
    totalError += error;
  }
  
  return totalError / points.length;
}

export function calculateParabolaError(points: Point[], parabola: ParabolaEquation): number {
  let totalError = 0;
  
  for (const point of points) {
    let error: number;
    
    if (parabola.isVertical) {
      const expectedY = parabola.a * point.x * point.x + parabola.b * point.x + parabola.c;
      error = Math.abs(point.y - expectedY);
    } else {
      const expectedX = parabola.a * point.y * point.y + parabola.b * point.y + parabola.c;
      error = Math.abs(point.x - expectedX);
    }
    
    totalError += error;
  }
  
  return totalError / points.length;
}


