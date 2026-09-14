import { detectDrawings } from '@/lib/shapeDetectors';

export type FittedDrawing =
  | {
      kind: 'rectangle' | 'ellipse' | 'circle' | 'triangle' | 'line';
      x: number;
      y: number;
      width: number;
      height: number;
      points?: { x: number; y: number }[];
    }
  | {
      kind: 'parabola';
      x: number;
      y: number;
      width: number;
      height: number;
      orientation: 'up' | 'down' | 'left' | 'right';
      points?: { x: number; y: number }[];
    };

export function fitDrawingFromStroke(
  points: { x: number; y: number }[],
  thresholds: { minSizePx: number; resampleStep: number; closureFactor: number },
): FittedDrawing | null {
  if (points.length < 3) return null;

  try {
    const result = detectDrawings(points, {
      debugMode: false,
      thresholds: {
        minConfidence: 0.5,
        maxError: 0.3,
        lineMaxError: 0.1,
        lineMinLength: thresholds.minSizePx,
        rectangleMaxError: 0.3,
        rectangleEdgeRatio: 0.6,
        ellipseMaxError: 0.35,
        circleRoundnessTolerance: 0.25,
        triangleMaxError: 0.35,
        triangleEdgeRatio: 0.5,
        parabolaMaxError: 0.3,
        parabolaMinCurvature: 0.05,
        parabolaSymmetryTolerance: 0.4,
        lineAngleTolerance: Math.PI / 12,
        rectangleCornerTolerance: Math.PI / 6,
        rectangleAspectRatioTolerance: 0.2,
        ellipseMinEccentricity: 0.05,
        triangleCornerTolerance: Math.PI / 4,
      },
      strokeProcessingOptions: {
        minSize: thresholds.minSizePx,
        resampleStep: thresholds.resampleStep,
        closureTolerance: thresholds.closureFactor,
        simplificationTolerance: 0.5,
        smoothingWindow: 3,
      },
    });

    if (!result.detectedDrawing) return null;
    const drawing = result.detectedDrawing.drawing;
    const bbox = drawing.boundingBox;

    if (drawing.type === 'parabola' && drawing.properties?.orientation) {
      const parabola: FittedDrawing = {
        kind: 'parabola',
        x: bbox.minX,
        y: bbox.minY,
        width: bbox.width,
        height: bbox.height,
        orientation: drawing.properties.orientation,
      };
      if (!drawing.points?.length) return parabola;
      return { ...parabola, points: drawing.points.map(({ x, y }) => ({ x, y })) };
    }

    if (
      drawing.type !== 'rectangle' &&
      drawing.type !== 'ellipse' &&
      drawing.type !== 'circle' &&
      drawing.type !== 'triangle' &&
      drawing.type !== 'line'
    ) {
      return null;
    }

    const fitted: FittedDrawing = {
      kind: drawing.type,
      x: bbox.minX,
      y: bbox.minY,
      width: bbox.width,
      height: bbox.height,
    };
    if (drawing.type !== 'triangle' || drawing.points?.length !== 3) return fitted;
    return { ...fitted, points: drawing.points.map(({ x, y }) => ({ x, y })) };
  } catch (error) {
    console.warn('Shape detection failed; leaving stroke unchanged:', error);
    return null;
  }
}
