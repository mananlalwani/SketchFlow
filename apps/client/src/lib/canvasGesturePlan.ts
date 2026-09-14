/** Select / pan / draw-tool routing for pointer-down and use-gesture drag. */

export type PointerDownRoute = 'select' | 'pan' | 'ignore' | 'draw-tool';

export function planPointerDownRoute(args: {
  currentTool: string;
  isSpacePan: boolean;
  button: number;
}): PointerDownRoute {
  if (args.currentTool === 'select' || args.currentTool === 'move') return 'select';
  if (args.currentTool === 'hand' || args.isSpacePan) return 'pan';
  if (args.button === 2) return 'ignore';
  return 'draw-tool';
}

export function shouldInterruptTouchForPen(args: {
  isStylus: boolean;
  hasActivePen: boolean;
  hasActiveTouch: boolean;
}): boolean {
  return args.isStylus && !args.hasActivePen && args.hasActiveTouch;
}

export type SessionDragAction =
  | 'ignore'
  | 'pan-start'
  | 'pan-move'
  | 'pan-end'
  | 'draw-start'
  | 'draw-move'
  | 'draw-stop';

export function planSessionDrag(args: {
  skipCustomTriangle: boolean;
  tap: boolean;
  touchBlocked: boolean;
  shouldPan: boolean;
  isPanning: boolean;
  active: boolean;
  hasPanOrigin: boolean;
  nativeMissing: boolean;
  hasActiveDrag: boolean;
  isDrawing: boolean;
  canStartDraw: boolean;
}): SessionDragAction {
  if (args.skipCustomTriangle || args.tap) return 'ignore';
  if (args.touchBlocked) return 'ignore';
  if (args.shouldPan) {
    if (!args.isPanning && args.active) return 'pan-start';
    if (args.isPanning && args.active && args.hasPanOrigin) return 'pan-move';
    if (!args.active) return 'pan-end';
    return 'ignore';
  }
  if (args.nativeMissing) return 'ignore';
  if (args.active && args.hasActiveDrag) return 'draw-move';
  if (!args.isDrawing && args.active) return args.canStartDraw ? 'draw-start' : 'ignore';
  if (args.isDrawing && args.active) return 'draw-move';
  if (!args.active) return 'draw-stop';
  return 'ignore';
}
