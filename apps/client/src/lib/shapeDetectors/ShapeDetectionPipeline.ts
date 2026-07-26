import type { BoundingBox, Point } from '../geometry';
import type { ProcessedStroke } from '../strokeProcessor';
import {
  createDetectedShape,
  DEFAULT_THRESHOLDS,
  type DetectionResult,
  type DetectionThresholds,
} from './types';

export interface ShapeDetectionResult {
  detectedShape: DetectionResult | null;
  allCandidates: DetectionResult[];
  processingTime: number;
  processedStroke: ProcessedStroke;
}

export interface DetectionOptions {
  thresholds?: Partial<DetectionThresholds>;
  enabledDetectors?: string[];
  strokeProcessingOptions?: {
    minSize?: number;
    resampleStep?: number;
    smoothingWindow?: number;
    closureTolerance?: number;
    simplificationTolerance?: number;
  };
  returnAllCandidates?: boolean;
  debugMode?: boolean;
}

type ShapeKind = 'line' | 'rectangle' | 'ellipse' | 'circle' | 'triangle' | 'parabola';

const SUPPORTED_SHAPES: ShapeKind[] = [
  'rectangle',
  'triangle',
  'circle',
  'ellipse',
  'line',
  'parabola',
];

const CLOSED_SHAPE_PRIORITY: Record<ShapeKind, number> = {
  rectangle: 4,
  triangle: 3,
  circle: 2,
  ellipse: 1,
  line: 0,
  parabola: 0,
};

const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function boundingBox(points: Point[]): BoundingBox {
  if (!points.length) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0, centerX: 0, centerY: 0 };
  }

  let minX = points[0].x;
  let maxX = minX;
  let minY = points[0].y;
  let maxY = minY;
  for (const point of points.slice(1)) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
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
    centerY: minY + height / 2,
  };
}

function pathLength(points: Point[]): number {
  return points.slice(1).reduce((total, point, index) => total + distance(points[index], point), 0);
}

function removeDuplicatePoints(points: Point[]): Point[] {
  return points.filter((point, index) => index === 0 || distance(points[index - 1], point) > 0.01);
}

function resample(points: Point[], spacing: number): Point[] {
  if (points.length < 2 || spacing <= 0) return points;

  const output = [points[0]];
  let carried = 0;
  let previous = points[0];
  for (const point of points.slice(1)) {
    let segmentStart = previous;
    let remaining = distance(segmentStart, point);
    while (carried + remaining >= spacing && remaining > 0) {
      const ratio = (spacing - carried) / remaining;
      segmentStart = {
        x: segmentStart.x + (point.x - segmentStart.x) * ratio,
        y: segmentStart.y + (point.y - segmentStart.y) * ratio,
      };
      output.push(segmentStart);
      remaining = distance(segmentStart, point);
      carried = 0;
    }
    carried += remaining;
    previous = point;
  }
  if (distance(output[output.length - 1], points[points.length - 1]) > spacing * 0.25) {
    output.push(points[points.length - 1]);
  }
  return output;
}

function perpendicularDistance(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return distance(point, start);
  return Math.abs(dy * point.x - dx * point.y + end.x * start.y - end.y * start.x) / length;
}

function simplify(points: Point[], tolerance: number): Point[] {
  if (points.length <= 2) return points;
  let farthestDistance = 0;
  let farthestIndex = 0;
  for (let index = 1; index < points.length - 1; index++) {
    const candidateDistance = perpendicularDistance(
      points[index],
      points[0],
      points[points.length - 1],
    );
    if (candidateDistance > farthestDistance) {
      farthestDistance = candidateDistance;
      farthestIndex = index;
    }
  }
  if (farthestDistance <= tolerance) return [points[0], points[points.length - 1]];
  return [
    ...simplify(points.slice(0, farthestIndex + 1), tolerance).slice(0, -1),
    ...simplify(points.slice(farthestIndex), tolerance),
  ];
}

function angle(a: Point, b: Point, c: Point): number {
  const first = { x: a.x - b.x, y: a.y - b.y };
  const second = { x: c.x - b.x, y: c.y - b.y };
  const magnitude = Math.hypot(first.x, first.y) * Math.hypot(second.x, second.y);
  if (!magnitude) return 0;
  return Math.acos(clamp((first.x * second.x + first.y * second.y) / magnitude, -1, 1));
}

function isRectangle(vertices: Point[]): { score: number; error: number } | null {
  if (vertices.length !== 4) return null;
  const angles = vertices.map((vertex, index) =>
    angle(vertices[(index + 3) % 4], vertex, vertices[(index + 1) % 4]),
  );
  const angleError =
    angles.reduce((sum, value) => sum + Math.abs(value - Math.PI / 2), 0) / ((4 * Math.PI) / 2);
  const sides = vertices.map((vertex, index) => distance(vertex, vertices[(index + 1) % 4]));
  const oppositeError =
    (Math.abs(sides[0] - sides[2]) / Math.max(sides[0], sides[2], 1) +
      Math.abs(sides[1] - sides[3]) / Math.max(sides[1], sides[3], 1)) /
    2;
  const error = (angleError + oppositeError) / 2;
  return error <= 0.28 ? { error, score: 1 - error } : null;
}

function rectangleEdgeFit(
  points: Point[],
  box: BoundingBox,
): { score: number; error: number } | null {
  const shortestSide = Math.min(box.width, box.height);
  if (shortestSide < 2 || points.length < 8) return null;

  const edgeVisits = [0, 0, 0, 0];
  const normalizedDistances = points.map((point) => {
    const distances = [
      Math.abs(point.y - box.minY),
      Math.abs(point.x - box.maxX),
      Math.abs(point.y - box.maxY),
      Math.abs(point.x - box.minX),
    ];
    const nearestEdge = distances.indexOf(Math.min(...distances));
    edgeVisits[nearestEdge] += 1;
    return distances[nearestEdge] / shortestSide;
  });
  const error = normalizedDistances.reduce((sum, value) => sum + value, 0) / points.length;
  const minimumEdgeVisits = Math.max(2, Math.floor(points.length * 0.08));

  // A rough rectangle still spends meaningful time near all four bounding-box
  // edges. Curves and scribbles do not, even if their bounding boxes are square.
  if (error > 0.12 || edgeVisits.some((visits) => visits < minimumEdgeVisits)) return null;
  return { error, score: clamp(1 - error / 0.12) };
}

function simplifyClosedPath(points: Point[], tolerance: number): Point[] {
  if (points.length < 4) return points;
  const anchor = points[0];
  let oppositeIndex = 1;
  for (let index = 2; index < points.length; index++) {
    if (distance(anchor, points[index]) > distance(anchor, points[oppositeIndex])) {
      oppositeIndex = index;
    }
  }

  // Simplifying a closed path directly makes RDP compare every point against a
  // zero-length start/end segment. Splitting at the farthest point preserves
  // real corners even when a hand-drawn loop starts in the middle of an edge.
  const firstHalf = simplify(points.slice(0, oppositeIndex + 1), tolerance);
  const secondHalf = simplify([...points.slice(oppositeIndex), anchor], tolerance);
  const vertices = [...firstHalf.slice(0, -1), ...secondHalf.slice(0, -1)];

  return vertices.filter(
    (vertex, index) =>
      distance(vertex, vertices[(index + vertices.length - 1) % vertices.length]) >= tolerance / 2,
  );
}

function hasPolygonIntent(vertices: Point[]): boolean {
  if (vertices.length < 3 || vertices.length > 8) return false;
  const meaningfulTurns = vertices.filter((vertex, index) => {
    const interiorAngle = angle(
      vertices[(index + vertices.length - 1) % vertices.length],
      vertex,
      vertices[(index + 1) % vertices.length],
    );
    return interiorAngle < (5 * Math.PI) / 6;
  });
  return meaningfulTurns.length >= 3 && meaningfulTurns.length <= 5;
}

function triangleArea(vertices: Point[]): number {
  return Math.abs(
    vertices.reduce((sum, point, index) => {
      const next = vertices[(index + 1) % vertices.length];
      return sum + point.x * next.y - next.x * point.y;
    }, 0) / 2,
  );
}

function distanceToSegment(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return distance(point, start);
  const ratio = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared);
  return distance(point, { x: start.x + dx * ratio, y: start.y + dy * ratio });
}

function dominantTriangleVertices(vertices: Point[]): Point[] | null {
  if (vertices.length < 3 || vertices.length > 8) return null;
  let best: Point[] | null = null;
  let largestArea = 0;
  for (let first = 0; first < vertices.length - 2; first++) {
    for (let second = first + 1; second < vertices.length - 1; second++) {
      for (let third = second + 1; third < vertices.length; third++) {
        const candidate = [vertices[first], vertices[second], vertices[third]];
        const area = triangleArea(candidate);
        if (area > largestArea) {
          largestArea = area;
          best = candidate;
        }
      }
    }
  }
  return best;
}

function triangleEdgeFit(
  points: Point[],
  vertices: Point[],
  diagonal: number,
): { score: number; error: number; vertices: Point[] } | null {
  const triangle = dominantTriangleVertices(vertices);
  if (!triangle || triangleArea(triangle) < diagonal * diagonal * 0.02) return null;

  const edgeVisits = [0, 0, 0];
  const distances = points.map((point) => {
    const edgeDistances = triangle.map((vertex, index) =>
      distanceToSegment(point, vertex, triangle[(index + 1) % triangle.length]),
    );
    const nearest = edgeDistances.indexOf(Math.min(...edgeDistances));
    edgeVisits[nearest] += 1;
    return edgeDistances[nearest] / Math.max(diagonal, 1);
  });
  const error = distances.reduce((sum, value) => sum + value, 0) / distances.length;
  const minimumEdgeVisits = Math.max(2, Math.floor(points.length * 0.1));
  if (error > 0.075 || edgeVisits.some((visits) => visits < minimumEdgeVisits)) return null;
  return { score: clamp(1 - error / 0.075), error, vertices: triangle };
}

function isEllipse(
  points: Point[],
  box: BoundingBox,
): { type: 'circle' | 'ellipse'; error: number } | null {
  if (box.width < 2 || box.height < 2 || points.length < 8) return null;
  const radiusX = box.width / 2;
  const radiusY = box.height / 2;
  const residuals = points.map((point) =>
    Math.abs(Math.hypot((point.x - box.centerX) / radiusX, (point.y - box.centerY) / radiusY) - 1),
  );
  const error = residuals.reduce((sum, residual) => sum + residual, 0) / residuals.length;
  if (error > 0.22) return null;
  const roundness = Math.min(radiusX, radiusY) / Math.max(radiusX, radiusY);
  return { type: roundness > 0.88 ? 'circle' : 'ellipse', error };
}

function lineCandidate(
  points: Point[],
  box: BoundingBox,
  thresholds: DetectionThresholds,
): DetectionResult | null {
  const start = points[0];
  const end = points[points.length - 1];
  const directLength = distance(start, end);
  if (directLength < thresholds.lineMinLength) return null;
  const totalLength = pathLength(points);
  const straightness = directLength / Math.max(totalLength, 1);
  const rmsError = Math.sqrt(
    points.reduce((sum, point) => sum + perpendicularDistance(point, start, end) ** 2, 0) /
      points.length,
  );
  const normalizedError = rmsError / directLength;
  if (straightness < thresholds.lineMinStraightness || normalizedError > thresholds.lineMaxError)
    return null;

  const confidence = clamp((straightness + (1 - normalizedError / thresholds.lineMaxError)) / 2);
  return {
    confidence,
    error: normalizedError,
    shape: createDetectedShape('line', box, {
      points: [start, end],
      properties: {
        angle: Math.atan2(end.y - start.y, end.x - start.x),
        length: directLength,
      },
    }),
    metadata: { straightness },
  };
}

function parabolaCandidate(
  points: Point[],
  box: BoundingBox,
  thresholds: DetectionThresholds,
): DetectionResult | null {
  const horizontal = box.width >= box.height;
  const samples = points.map((point) => ({
    input: horizontal ? point.x : point.y,
    output: horizontal ? point.y : point.x,
  }));
  if (samples.length < 5) return null;
  const n = samples.length;
  const sums = samples.reduce(
    (accumulator, sample) => ({
      x: accumulator.x + sample.input,
      x2: accumulator.x2 + sample.input ** 2,
      x3: accumulator.x3 + sample.input ** 3,
      x4: accumulator.x4 + sample.input ** 4,
      y: accumulator.y + sample.output,
      xy: accumulator.xy + sample.input * sample.output,
      x2y: accumulator.x2y + sample.input ** 2 * sample.output,
    }),
    { x: 0, x2: 0, x3: 0, x4: 0, y: 0, xy: 0, x2y: 0 },
  );
  const determinant =
    sums.x4 * (sums.x2 * n - sums.x * sums.x) -
    sums.x3 * (sums.x3 * n - sums.x * sums.x2) +
    sums.x2 * (sums.x3 * sums.x - sums.x2 * sums.x2);
  if (Math.abs(determinant) < 1e-7) return null;

  const a =
    (sums.x2y * (sums.x2 * n - sums.x * sums.x) -
      sums.x3 * (sums.xy * n - sums.x * sums.y) +
      sums.x2 * (sums.xy * sums.x - sums.x2 * sums.y)) /
    determinant;
  const b =
    (sums.x4 * (sums.xy * n - sums.x * sums.y) -
      sums.x2y * (sums.x3 * n - sums.x * sums.x2) +
      sums.x2 * (sums.x3 * sums.y - sums.xy * sums.x2)) /
    determinant;
  const c = (sums.y - a * sums.x2 - b * sums.x) / n;
  const scale = Math.max(box.width, box.height, 1);
  const error =
    Math.sqrt(
      samples.reduce(
        (sum, sample) =>
          sum + (sample.output - (a * sample.input ** 2 + b * sample.input + c)) ** 2,
        0,
      ) / n,
    ) / scale;
  const curvature = Math.abs(a) * (horizontal ? box.width : box.height);
  if (curvature < thresholds.parabolaMinCurvature || error > thresholds.parabolaMaxError)
    return null;

  const orientation = horizontal ? (a > 0 ? 'down' : 'up') : a > 0 ? 'right' : 'left';
  return {
    confidence: clamp(1 - error / thresholds.parabolaMaxError),
    error,
    shape: createDetectedShape('parabola', box, { properties: { orientation, curvature } }),
    metadata: { curvature },
  };
}

/**
 * A deterministic, single-pass recognizer. It intentionally recognizes only shapes
 * the canvas can turn into editable objects; freehand strokes remain freehand.
 */
export class ShapeDetectionPipeline {
  private readonly options: DetectionOptions;

  constructor(options: DetectionOptions = {}) {
    this.options = options;
  }

  detectShape(points: Point[], callOptions: DetectionOptions = {}): ShapeDetectionResult {
    const start = performance.now();
    const options = { ...this.options, ...callOptions };
    const thresholds = {
      ...DEFAULT_THRESHOLDS,
      ...this.options.thresholds,
      ...callOptions.thresholds,
    };
    const source = removeDuplicatePoints(points);
    const box = boundingBox(source);
    const minSize = options.strokeProcessingOptions?.minSize ?? 10;
    const diagonal = Math.hypot(box.width, box.height);
    const processedPoints = resample(source, options.strokeProcessingOptions?.resampleStep ?? 3);
    const closureDistance =
      source.length > 1 ? distance(source[0], source[source.length - 1]) : Infinity;
    const isClosed =
      closureDistance <=
      Math.max(6, diagonal * (options.strokeProcessingOptions?.closureTolerance ?? 0.15));
    const processedStroke: ProcessedStroke = {
      originalPoints: points,
      processedPoints,
      boundingBox: box,
      totalLength: pathLength(processedPoints),
      isClosed,
      isSmooth: true,
      aspectRatio: box.width / Math.max(box.height, 1),
      complexity: 0,
    };

    if (source.length < 3 || Math.max(box.width, box.height) < minSize) {
      return {
        detectedShape: null,
        allCandidates: [],
        processingTime: performance.now() - start,
        processedStroke,
      };
    }

    const enabled = new Set(options.enabledDetectors ?? SUPPORTED_SHAPES);
    const candidates: DetectionResult[] = [];
    if (!isClosed && enabled.has('line')) {
      const candidate = lineCandidate(processedPoints, box, thresholds);
      if (candidate) candidates.push(candidate);
    }

    if (isClosed) {
      // `simplificationTolerance` is a world-pixel distance, matching the
      // canvas setting. Treating 0.5 as a fraction of the board diagonal
      // collapsed ordinary rectangles into a two-point path.
      const tolerance = Math.max(
        2,
        options.strokeProcessingOptions?.simplificationTolerance ?? diagonal * 0.025,
      );
      const vertices = simplifyClosedPath(processedPoints, tolerance);

      const rectangle = isRectangle(vertices) ?? rectangleEdgeFit(processedPoints, box);
      if (enabled.has('rectangle')) {
        if (rectangle && rectangle.error <= thresholds.rectangleMaxError) {
          candidates.push({
            confidence: rectangle.score,
            error: rectangle.error,
            shape: createDetectedShape('rectangle', box, {
              points:
                vertices.length === 4
                  ? vertices
                  : [
                      { x: box.minX, y: box.minY },
                      { x: box.maxX, y: box.minY },
                      { x: box.maxX, y: box.maxY },
                      { x: box.minX, y: box.maxY },
                    ],
            }),
          });
        }
      }
      const confidentRectangle =
        rectangle !== null &&
        rectangle.error <= thresholds.rectangleMaxError &&
        rectangle.score >= thresholds.minConfidence;
      if (enabled.has('triangle') && !confidentRectangle) {
        const triangle = triangleEdgeFit(processedPoints, vertices, diagonal);
        if (triangle && triangle.error <= thresholds.triangleMaxError) {
          candidates.push({
            confidence: triangle.score,
            error: triangle.error,
            shape: createDetectedShape('triangle', box, { points: triangle.vertices }),
          });
        }
      }
      // A loop with several deliberate turns is polygon intent, even if its
      // corners are too rough to produce a confident rectangle candidate.
      // Leave it as a freehand stroke rather than incorrectly turning it into
      // an ellipse; that is reversible and matches the user's drawing intent.
      if ((enabled.has('ellipse') || enabled.has('circle')) && !hasPolygonIntent(vertices)) {
        const ellipse = isEllipse(processedPoints, box);
        if (ellipse && ellipse.error <= thresholds.ellipseMaxError && enabled.has(ellipse.type)) {
          candidates.push({
            confidence: 1 - ellipse.error,
            error: ellipse.error,
            shape: createDetectedShape(ellipse.type, box),
          });
        }
      }
    } else if (enabled.has('parabola')) {
      const candidate = parabolaCandidate(processedPoints, box, thresholds);
      if (candidate) candidates.push(candidate);
    }

    const eligible = candidates.filter(
      (candidate) => candidate.confidence >= thresholds.minConfidence,
    );
    eligible.sort((left, right) => {
      // A rounded rectangle can also score well as an ellipse. Once the loop
      // has passed the stricter four-edge fit, retain that stronger intent.
      const priorityDifference =
        CLOSED_SHAPE_PRIORITY[right.shape.type as ShapeKind] -
        CLOSED_SHAPE_PRIORITY[left.shape.type as ShapeKind];
      return priorityDifference || right.confidence - left.confidence || left.error - right.error;
    });
    return {
      detectedShape: eligible[0] ?? null,
      allCandidates: options.returnAllCandidates ? eligible : [],
      processingTime: performance.now() - start,
      processedStroke,
    };
  }
}
