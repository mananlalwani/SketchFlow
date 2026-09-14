import type { Drawing, Outbound, Stroke, ViewportMessage } from './rendererWorkerTypes';
import type { PathContext, ParabolaDrawing } from './rendererWorkerTypes';

export interface ConsolidatedPath {
  groupId: string;
  color: string;
  size: number;
  alpha: number;
  points: { x: number; y: number; width?: number }[];
  maxWidth: number;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

export interface RendererRuntime {
  screenCtx: OffscreenCanvasRenderingContext2D | null;
  world: OffscreenCanvas | null;
  worldCtx: OffscreenCanvasRenderingContext2D | null;
  worldW: number;
  worldH: number;
  retainedDrawings: Drawing[];
  consolidatedPaths: Map<string, ConsolidatedPath>;
  lastViewport: ViewportMessage;
  lastSceneRequestId?: string;
  canvasBgColor: string;
  isLightMode: boolean;
  imageBitmapCache: Map<string, ImageBitmap>;
  postMessage: (msg: Outbound) => void;
  loadImageBitmap: (dataUrl: string) => Promise<ImageBitmap | null>;
  applyObjectRotation: (
    context: OffscreenCanvasRenderingContext2D,
    drawing: Pick<Drawing, 'x' | 'y' | 'width' | 'height' | 'properties'>,
  ) => void;
  adjustColorForTheme: (color: string) => string;
  ensureWorld: () => void;
  drawStrokeToWorld: (stroke: Stroke) => void;
  drawDrawingToWorld: (drawing: Drawing) => void;
  scheduleBlit: () => void;
  traceParabolaPath: (context: PathContext, drawing: ParabolaDrawing) => void;
  hexToRgb: (color: string) => { r: number; g: number; b: number } | null;
  getLuminance: (r: number, g: number, b: number) => number;
  isBackgroundColor: (color: string) => boolean;
  getMaxStrokeWidth: (
    points: { x: number; y: number; width?: number }[],
    size: number,
  ) => number;
  drawWorkerStrokePath: (
    context: OffscreenCanvasRenderingContext2D,
    path: ConsolidatedPath,
    color: string,
  ) => void;
  drawWorkerRendererObject: (
    context: OffscreenCanvasRenderingContext2D,
    drawing: Drawing,
    color: string,
    size?: number,
  ) => void;
}

export function createRendererRuntime(): Omit<
  RendererRuntime,
  | 'postMessage'
  | 'loadImageBitmap'
  | 'applyObjectRotation'
  | 'adjustColorForTheme'
  | 'ensureWorld'
  | 'drawStrokeToWorld'
  | 'drawDrawingToWorld'
  | 'scheduleBlit'
  | 'traceParabolaPath'
  | 'hexToRgb'
  | 'getLuminance'
  | 'isBackgroundColor'
  | 'getMaxStrokeWidth'
  | 'drawWorkerStrokePath'
  | 'drawWorkerRendererObject'
> {
  return {
    screenCtx: null,
    world: null,
    worldCtx: null,
    worldW: 51200,
    worldH: 28800,
    retainedDrawings: [],
    consolidatedPaths: new Map(),
    lastViewport: {
      type: 'viewport',
      zoom: 1,
      viewX: 0,
      viewY: 0,
      canvasWidth: 0,
      canvasHeight: 0,
      dpr: 1,
    },
    lastSceneRequestId: undefined,
    canvasBgColor: '#0a0a0a',
    isLightMode: false,
    imageBitmapCache: new Map(),
  };
}
