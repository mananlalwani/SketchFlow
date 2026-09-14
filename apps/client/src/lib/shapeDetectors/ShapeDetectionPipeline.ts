import type { Point } from '../geometry';
import type { ProcessedStroke } from '../strokeProcessor';
import { createDetectedDrawing, DEFAULT_THRESHOLDS, type DetectionResult, type DetectionThresholds } from './types';
import {
  boundingBox,
  closedDrawingPriority,
  distance,
  hasPolygonIntent,
  isEllipse,
  isRectangle,
  lineCandidate,
  parabolaCandidate,
  pathLength,
  rectangleEdgeFit,
  removeDuplicatePoints,
  resample,
  simplifyClosedPath,
  SUPPORTED_DRAWINGS,
  triangleEdgeFit,
  triangleVerticesFromTurns,
} from './shapeDetectionFit';

export interface DrawingDetectionResult {
  detectedDrawing: DetectionResult | null;
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

/**
 * A deterministic, single-pass recognizer. It intentionally recognizes only shapes
 * the canvas can turn into editable objects; freehand strokes remain freehand.
 */
export class DrawingDetectionPipeline {
  private readonly options: DetectionOptions;

  constructor(options: DetectionOptions = {}) {
    this.options = options;
  }

  detectDrawing(points: Point[], callOptions: DetectionOptions = {}): DrawingDetectionResult {
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
    // Hand-drawn polygons commonly finish close to, rather than exactly on,
    // their first point. Keep the user-configured tolerance as a floor but
    // allow a practical near-close window for automatic shape recognition.
    const closureTolerance = Math.max(
      options.strokeProcessingOptions?.closureTolerance ?? 0.15,
      0.24,
    );
    const isClosed = closureDistance <= Math.max(8, diagonal * closureTolerance);
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
        detectedDrawing: null,
        allCandidates: [],
        processingTime: performance.now() - start,
        processedStroke,
      };
    }

    const enabled = new Set(options.enabledDetectors ?? SUPPORTED_DRAWINGS);
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
            drawing: createDetectedDrawing('rectangle', box, {
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
        const triangleVertices = triangleVerticesFromTurns(processedPoints, diagonal) ?? vertices;
        const triangle = triangleEdgeFit(processedPoints, triangleVertices, diagonal);
        if (triangle && triangle.error <= thresholds.triangleMaxError) {
          candidates.push({
            confidence: triangle.score,
            error: triangle.error,
            drawing: createDetectedDrawing('triangle', box, { points: triangle.vertices }),
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
            drawing: createDetectedDrawing(ellipse.type, box),
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
        closedDrawingPriority(right.drawing.type) - closedDrawingPriority(left.drawing.type);
      return priorityDifference || right.confidence - left.confidence || left.error - right.error;
    });
    return {
      detectedDrawing: eligible[0] ?? null,
      allCandidates: options.returnAllCandidates ? eligible : [],
      processingTime: performance.now() - start,
      processedStroke,
    };
  }
}
