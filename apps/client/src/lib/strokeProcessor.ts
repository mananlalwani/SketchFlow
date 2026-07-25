/**
 * Stroke preprocessing and analysis utilities
 */

import {
  Point,
  BoundingBox,
  getBoundingBox,
  resamplePath,
  smoothPath,
  calculateTotalPathLength,
  isClosedPath,
} from './geometry';

export interface ProcessedStroke {
  originalPoints: Point[];
  processedPoints: Point[];
  boundingBox: BoundingBox;
  totalLength: number;
  isClosed: boolean;
  isSmooth: boolean;
  aspectRatio: number;
  complexity: number;
}

export interface StrokeProcessingOptions {
  minSize: number;
  resampleStep: number;
  smoothingWindow: number;
  closureTolerance: number;
  simplificationTolerance: number;
}

export const DEFAULT_PROCESSING_OPTIONS: StrokeProcessingOptions = {
  minSize: 10,
  resampleStep: 2,
  smoothingWindow: 3,
  closureTolerance: 0.15, // As fraction of diagonal
  simplificationTolerance: 1.0,
};

/**
 * Preprocess a stroke for shape detection
 */
export function processStroke(
  points: Point[],
  options: Partial<StrokeProcessingOptions> = {},
): ProcessedStroke | null {
  const opts = { ...DEFAULT_PROCESSING_OPTIONS, ...options };

  if (!points || points.length < 3) {
    return null;
  }

  // Calculate initial bounding box
  const initialBbox = getBoundingBox(points);

  // Filter out strokes that are too small
  if (Math.min(initialBbox.width, initialBbox.height) < opts.minSize) {
    return null;
  }

  // Step 1: Simplify path to remove noise - adapt tolerance to stroke size
  const adaptiveTolerance = Math.max(
    0.1,
    Math.min(opts.simplificationTolerance, Math.min(initialBbox.width, initialBbox.height) * 0.01),
  );
  let processedPoints = simplifyPath(points, adaptiveTolerance);

  // Step 2: Resample for consistent spacing
  if (opts.resampleStep > 0) {
    processedPoints = resamplePath(processedPoints, opts.resampleStep);
  }

  // Step 3: Light smoothing to reduce noise
  if (opts.smoothingWindow >= 3) {
    processedPoints = smoothPath(processedPoints, opts.smoothingWindow);
  }

  // Recalculate bounding box after processing
  const finalBbox = getBoundingBox(processedPoints);

  // Check closure
  const diagonal = Math.sqrt(
    finalBbox.width * finalBbox.width + finalBbox.height * finalBbox.height,
  );
  const closureThreshold = diagonal * opts.closureTolerance;
  const isClosed = isClosedPath(processedPoints, closureThreshold);

  // Calculate metrics
  const totalLength = calculateTotalPathLength(processedPoints);
  const aspectRatio = finalBbox.width / Math.max(finalBbox.height, 1);
  const isSmooth = calculateSmoothness(processedPoints) > 0.7;
  const complexity = calculateComplexity(processedPoints);

  return {
    originalPoints: points,
    processedPoints,
    boundingBox: finalBbox,
    totalLength,
    isClosed,
    isSmooth,
    aspectRatio,
    complexity,
  };
}

/**
 * Simplify a path using Douglas-Peucker algorithm
 */
function simplifyPath(points: Point[], tolerance: number): Point[] {
  if (points.length <= 2) return points;

  return douglasPeucker(points, tolerance);
}

function douglasPeucker(points: Point[], tolerance: number): Point[] {
  if (points.length <= 2) return points;

  // Find the point with maximum distance from line between first and last
  let maxDistance = 0;
  let maxIndex = 0;

  const start = points[0];
  const end = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const distance = perpendicularDistance(points[i], start, end);
    if (distance > maxDistance) {
      maxDistance = distance;
      maxIndex = i;
    }
  }

  // If max distance is greater than tolerance, recursively simplify
  if (maxDistance > tolerance) {
    const left = douglasPeucker(points.slice(0, maxIndex + 1), tolerance);
    const right = douglasPeucker(points.slice(maxIndex), tolerance);

    // Combine results, avoiding duplicate middle point
    return [...left.slice(0, -1), ...right];
  } else {
    // All points between start and end can be removed
    return [start, end];
  }
}

function perpendicularDistance(point: Point, lineStart: Point, lineEnd: Point): number {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;

  if (dx === 0 && dy === 0) {
    // Line is actually a point
    return Math.sqrt((point.x - lineStart.x) ** 2 + (point.y - lineStart.y) ** 2);
  }

  const numerator = Math.abs(
    dy * point.x - dx * point.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x,
  );
  const denominator = Math.sqrt(dx * dx + dy * dy);

  return numerator / denominator;
}

/**
 * Calculate stroke smoothness (0 = very jagged, 1 = very smooth)
 */
function calculateSmoothness(points: Point[]): number {
  if (points.length < 3) return 1;

  let totalAngleChange = 0;
  let validSegments = 0;

  for (let i = 1; i < points.length - 1; i++) {
    const p1 = points[i - 1];
    const p2 = points[i];
    const p3 = points[i + 1];

    const v1x = p2.x - p1.x;
    const v1y = p2.y - p1.y;
    const v2x = p3.x - p2.x;
    const v2y = p3.y - p2.y;

    const len1 = Math.sqrt(v1x * v1x + v1y * v1y);
    const len2 = Math.sqrt(v2x * v2x + v2y * v2y);

    if (len1 > 0 && len2 > 0) {
      const dot = (v1x * v2x + v1y * v2y) / (len1 * len2);
      const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
      totalAngleChange += angle;
      validSegments++;
    }
  }

  if (validSegments === 0) return 1;

  const averageAngleChange = totalAngleChange / validSegments;
  const maxAngleChange = Math.PI; // 180 degrees

  return 1 - averageAngleChange / maxAngleChange;
}

/**
 * Calculate stroke complexity (higher = more complex/detailed)
 */
function calculateComplexity(points: Point[]): number {
  if (points.length < 3) return 0;

  // Measure changes in direction
  let directionChanges = 0;
  let previousAngle: number | null = null;

  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;

    if (dx !== 0 || dy !== 0) {
      const angle = Math.atan2(dy, dx);

      if (previousAngle !== null) {
        let angleDiff = Math.abs(angle - previousAngle);
        if (angleDiff > Math.PI) {
          angleDiff = 2 * Math.PI - angleDiff;
        }

        // Count significant direction changes - be more sensitive
        if (angleDiff > Math.PI / 12) {
          // 15 degrees (was 30)
          directionChanges++;
        }
      }

      previousAngle = angle;
    }
  }

  // Normalize by path length
  return directionChanges / Math.max(points.length - 1, 1);
}

/**
 * Analyze stroke for specific patterns
 */
export interface StrokeAnalysis {
  hasSharpCorners: boolean;
  cornerCount: number;
  corners: Point[];
  hasLongStraightSegments: boolean;
  straightSegmentRatio: number;
  dominantDirection: 'horizontal' | 'vertical' | 'diagonal' | 'circular';
  symmetry: number; // 0-1, higher = more symmetric
}

export function analyzeStroke(processed: ProcessedStroke): StrokeAnalysis {
  const points = processed.processedPoints;

  // Find corners
  const corners = findCorners(points);
  const hasSharpCorners = corners.length >= 2;

  // Analyze straight segments
  const straightRatio = calculateStraightSegmentRatio(points);
  const hasLongStraightSegments = straightRatio > 0.6;

  // Determine dominant direction
  const dominantDirection = determineDominantDirection(points, processed.boundingBox);

  // Calculate symmetry
  const symmetry = calculateSymmetry(points, processed.boundingBox);

  return {
    hasSharpCorners,
    cornerCount: corners.length,
    corners,
    hasLongStraightSegments,
    straightSegmentRatio: straightRatio,
    dominantDirection,
    symmetry,
  };
}

function findCorners(points: Point[], angleThreshold: number = Math.PI * 0.6): Point[] {
  // 108° deviation from straight (72° min angle)
  if (points.length < 3) return [];

  const corners: Point[] = [];
  const minSegmentLength = 8; // Increased minimum distance to reduce noise
  const minCornerSeparation = 15; // Minimum distance between detected corners

  const minCornerAngleDeg = (((Math.PI - angleThreshold) * 180) / Math.PI).toFixed(1);
  console.log(
    `findCorners: Processing ${points.length} points, minCornerAngle=${minCornerAngleDeg}°`,
  );

  for (let i = 1; i < points.length - 1; i++) {
    const p1 = points[i - 1];
    const p2 = points[i];
    const p3 = points[i + 1];

    // Skip if segments are too short
    const dist1 = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
    const dist2 = Math.sqrt((p3.x - p2.x) ** 2 + (p3.y - p2.y) ** 2);

    if (dist1 < minSegmentLength || dist2 < minSegmentLength) continue;

    // Skip if too close to an existing corner
    const tooCloseToExisting = corners.some(
      (corner) => Math.sqrt((corner.x - p2.x) ** 2 + (corner.y - p2.y) ** 2) < minCornerSeparation,
    );
    if (tooCloseToExisting) continue;

    const v1x = p2.x - p1.x;
    const v1y = p2.y - p1.y;
    const v2x = p3.x - p2.x;
    const v2y = p3.y - p2.y;

    const len1 = Math.sqrt(v1x * v1x + v1y * v1y);
    const len2 = Math.sqrt(v2x * v2x + v2y * v2y);

    if (len1 > 0 && len2 > 0) {
      const dot = (v1x * v2x + v1y * v2y) / (len1 * len2);
      const angle = Math.acos(Math.max(-1, Math.min(1, dot)));

      // For corners, we want large angles (sharp turns), not small ones (smooth curves)
      // angle ranges from 0° (parallel) to 180° (opposite direction)
      const minCornerAngle = Math.PI - angleThreshold; // Convert from "deviation from straight" to "minimum angle for corner"
      if (angle > minCornerAngle) {
        corners.push(p2);
        if (corners.length <= 10) {
          // Only log first 10 to avoid spam
          console.log(
            `  Corner ${corners.length}: angle=${((angle * 180) / Math.PI).toFixed(1)}° at (${p2.x.toFixed(1)}, ${p2.y.toFixed(1)})`,
          );
        }
      }
    }
  }

  console.log(`findCorners: Found ${corners.length} total corners`);
  return corners;
}

function calculateStraightSegmentRatio(points: Point[]): number {
  if (points.length < 3) return 1;

  let straightLength = 0;
  let totalLength = 0;

  const straightThreshold = 5; // degrees
  const radiansThreshold = (straightThreshold * Math.PI) / 180;

  for (let i = 2; i < points.length; i++) {
    const p1 = points[i - 2];
    const p2 = points[i - 1];
    const p3 = points[i];

    const v1x = p2.x - p1.x;
    const v1y = p2.y - p1.y;
    const v2x = p3.x - p2.x;
    const v2y = p3.y - p2.y;

    const len1 = Math.sqrt(v1x * v1x + v1y * v1y);
    const len2 = Math.sqrt(v2x * v2x + v2y * v2y);

    totalLength += len2;

    if (len1 > 0 && len2 > 0) {
      const dot = (v1x * v2x + v1y * v2y) / (len1 * len2);
      const angle = Math.acos(Math.max(-1, Math.min(1, dot)));

      if (angle < radiansThreshold || angle > Math.PI - radiansThreshold) {
        straightLength += len2;
      }
    }
  }

  return totalLength > 0 ? straightLength / totalLength : 0;
}

function determineDominantDirection(
  points: Point[],
  bbox: BoundingBox,
): 'horizontal' | 'vertical' | 'diagonal' | 'circular' {
  // Analyze overall aspect ratio
  const aspectRatio = bbox.width / Math.max(bbox.height, 1);

  if (aspectRatio > 2) return 'horizontal';
  if (aspectRatio < 0.5) return 'vertical';

  // For more square shapes, analyze the actual path
  let horizontalMovement = 0;
  let verticalMovement = 0;
  let circularIndicator = 0;

  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;

    horizontalMovement += Math.abs(dx);
    verticalMovement += Math.abs(dy);

    // Check for circular motion (changes in direction)
    if (i >= 2) {
      const prevDx = points[i - 1].x - points[i - 2].x;
      const prevDy = points[i - 1].y - points[i - 2].y;

      const cross = dx * prevDy - dy * prevDx;
      circularIndicator += Math.abs(cross);
    }
  }

  const totalMovement = horizontalMovement + verticalMovement;
  const circularRatio = circularIndicator / (totalMovement + 1); // Fixed: don't square the denominator

  console.log(
    `Direction analysis: horizontal=${horizontalMovement.toFixed(1)}, vertical=${verticalMovement.toFixed(1)}, circularIndicator=${circularIndicator.toFixed(1)}, circularRatio=${circularRatio.toFixed(2)}`,
  );

  if (circularRatio > 2) {
    // Lowered from 5 to 2
    console.log(`  -> CIRCULAR (ratio ${circularRatio.toFixed(2)} > 2)`);
    return 'circular'; // Lower threshold for circular detection
  }

  const horizontalRatio = horizontalMovement / totalMovement;

  console.log(`  horizontalRatio=${horizontalRatio.toFixed(3)}`);

  if (horizontalRatio > 0.7) {
    console.log(`  -> HORIZONTAL (ratio ${horizontalRatio.toFixed(3)} > 0.7)`);
    return 'horizontal';
  }
  if (horizontalRatio < 0.3) {
    console.log(`  -> VERTICAL (ratio ${horizontalRatio.toFixed(3)} < 0.3)`);
    return 'vertical';
  }

  console.log(`  -> DIAGONAL (ratio ${horizontalRatio.toFixed(3)} between 0.3-0.7)`);
  return 'diagonal';
}

function calculateSymmetry(points: Point[], bbox: BoundingBox): number {
  if (points.length < 4) return 0;

  // Test horizontal symmetry
  const horizontalSymmetry = testHorizontalSymmetry(points, bbox);

  // Test vertical symmetry
  const verticalSymmetry = testVerticalSymmetry(points, bbox);

  return Math.max(horizontalSymmetry, verticalSymmetry);
}

function testHorizontalSymmetry(points: Point[], bbox: BoundingBox): number {
  const centerY = bbox.centerY;
  let matches = 0;
  let total = 0;

  const tolerance = Math.max(bbox.width, bbox.height) * 0.1;

  for (const point of points) {
    const reflectedY = centerY + (centerY - point.y);

    // Find closest point to the reflected position
    let closestDistance = Infinity;
    for (const otherPoint of points) {
      const distance = Math.sqrt((point.x - otherPoint.x) ** 2 + (reflectedY - otherPoint.y) ** 2);
      closestDistance = Math.min(closestDistance, distance);
    }

    if (closestDistance < tolerance) {
      matches++;
    }
    total++;
  }

  return total > 0 ? matches / total : 0;
}

function testVerticalSymmetry(points: Point[], bbox: BoundingBox): number {
  const centerX = bbox.centerX;
  let matches = 0;
  let total = 0;

  const tolerance = Math.max(bbox.width, bbox.height) * 0.1;

  for (const point of points) {
    const reflectedX = centerX + (centerX - point.x);

    // Find closest point to the reflected position
    let closestDistance = Infinity;
    for (const otherPoint of points) {
      const distance = Math.sqrt((reflectedX - otherPoint.x) ** 2 + (point.y - otherPoint.y) ** 2);
      closestDistance = Math.min(closestDistance, distance);
    }

    if (closestDistance < tolerance) {
      matches++;
    }
    total++;
  }

  return total > 0 ? matches / total : 0;
}
