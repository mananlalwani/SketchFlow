import { useCallback, useMemo, type RefObject } from 'react';
import { useCanvasDrawingSessionState } from '@/hooks/useCanvasDrawingSessionState';
import { useCanvasPointerGestures } from '@/hooks/useCanvasPointerGestures';
import { useCanvasGestureBindings } from '@/hooks/useCanvasGestureBindings';
import { useDrawingStore } from '@/store/drawingStore';
import { screenPointToWorld } from '@/lib/canvasPointer';
import type { StrokeData } from '@/types/socket';
import type { CanvasThemeName } from '@/lib/canvasTheme';
import {
  isStylusInput,
  observePointerDown,
  type PointerPolicyInput,
} from '@/lib/canvasInputPolicy';
import type { CanvasPresentation } from '@/lib/canvasPresentation';
import type { useCanvasViewportSession } from '@/hooks/useCanvasViewportSession';

type ViewportSession = ReturnType<typeof useCanvasViewportSession>;

interface UseCanvasDrawingSessionOptions {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  presentation: CanvasPresentation;
  viewport: ViewportSession;
  canDraw: boolean;
  theme: CanvasThemeName;
  emitCursor: (x: number, y: number) => void;
  openTextInput: (clientX: number, clientY: number, worldX: number, worldY: number) => void;
  textInputBlocked: boolean;
  toast: (opts: { title: string; description: string; variant: 'destructive' }) => unknown;
}

export function useCanvasDrawingSession({
  canvasRef,
  presentation,
  viewport,
  canDraw,
  theme,
  emitCursor,
  openTextInput,
  textInputBlocked,
  toast,
}: UseCanvasDrawingSessionOptions) {
  const currentTool = useDrawingStore((s) => s.currentTool);
  const triangleMode = useDrawingStore((s) => s.triangleMode);
  const zoom = useDrawingStore((s) => s.zoom);
  const viewX = useDrawingStore((s) => s.viewX);
  const viewY = useDrawingStore((s) => s.viewY);
  const inputMode = useDrawingStore((s) => s.inputMode);
  const fingerAction = useDrawingStore((s) => s.fingerAction);
  const sessionStylusSuppression = useDrawingStore((s) => s.sessionStylusSuppression);
  const setSessionStylusSuppression = useDrawingStore((s) => s.setSessionStylusSuppression);

  const session = useCanvasDrawingSessionState();
  const {
    dragPreviewObject,
    dragPreviewObjects,
    isDrawing,
    previewDrawing,
    setIsShiftPressed,
    isConstraintMode,
    setIsConstraintMode,
    isPanning,
    setIsPanning,
    panStart,
    setPanStart,
    isSpacePan,
    setIsSpacePan,
    triangleVertices,
    setTriangleVertices,
    draggedObject,
    selectionRect,
    showShortcuts,
    setShowShortcuts,
    activeDragRef,
    pointerPolicyRef,
    activeCanvasPointerRef,
    activeCanvasPointersRef,
    canvasPointerMovedRef,
    lastCanvasPointerTypeRef,
    lastCanvasPointerPressureRef,
  } = session;

  const inputPreferences = useMemo(
    () => ({ inputMode, fingerAction, sessionStylusSuppression }),
    [fingerAction, inputMode, sessionStylusSuppression],
  );
  const pointerPolicyInput = useCallback(
    (event: Pick<PointerEvent, 'pointerType' | 'pointerId'>, touches = 1): PointerPolicyInput => ({
      pointerType: event.pointerType,
      pointerId: event.pointerId,
      touches,
    }),
    [],
  );
  const observeCanvasPointerDown = useCallback(
    (input: PointerPolicyInput) => {
      observePointerDown(pointerPolicyRef.current, input);
      if (
        isStylusInput(input) &&
        useDrawingStore.getState().inputMode === 'auto' &&
        !useDrawingStore.getState().sessionStylusSuppression
      ) {
        setSessionStylusSuppression(true);
      }
    },
    [pointerPolicyRef, setSessionStylusSuppression],
  );

  const screenToWorld = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      return screenPointToWorld(
        canvas.getBoundingClientRect(),
        { zoom, viewX, viewY },
        clientX,
        clientY,
      );
    },
    [canvasRef, viewX, viewY, zoom],
  );

  const enqueueWorkerStroke = useCallback(
    (stroke: StrokeData) => {
      presentation.appendStroke(stroke);
    },
    [presentation],
  );

  const startSpacePan = useCallback(() => setIsSpacePan(true), [setIsSpacePan]);
  const endSpacePan = useCallback(() => {
    setIsSpacePan(false);
    setIsPanning(false);
    setPanStart(null);
  }, [setIsPanning, setIsSpacePan, setPanStart]);
  const clearConstraintMode = useCallback(() => setIsConstraintMode(false), [setIsConstraintMode]);
  const clearTriangleVertices = useCallback(() => setTriangleVertices([]), [setTriangleVertices]);

  const { startDrawing, draw, stopDrawing, handleCanvasClick, cancelActiveGesture } =
    useCanvasPointerGestures({
      canvasRef,
      presentation,
      viewport,
      canDraw,
      theme,
      emitCursor,
      openTextInput,
      textInputBlocked,
      toast,
      session,
      screenToWorld,
      enqueueWorkerStroke,
      inputPreferences,
      pointerPolicyInput,
    });

  const canvasPointerHandlers = useCanvasGestureBindings({
    canvasRef,
    viewport,
    zoom,
    viewX,
    viewY,
    currentTool,
    triangleMode,
    canDraw,
    isDrawing,
    isPanning,
    isSpacePan,
    panStart,
    setIsPanning,
    setPanStart,
    pointerPolicyRef,
    pointerPolicyInput,
    observeCanvasPointerDown,
    inputPreferences,
    activeDragPresent: () => activeDragRef.current !== null,
    startDrawing,
    draw,
    stopDrawing,
    handleCanvasClick,
    cancelActiveGesture,
    activeCanvasPointerRef,
    activeCanvasPointersRef,
    lastCanvasPointerTypeRef,
    lastCanvasPointerPressureRef,
    canvasPointerMovedRef,
  });

  return {
    isPanning,
    isSpacePan,
    isConstraintMode,
    setIsConstraintMode,
    previewDrawing,
    triangleVertices,
    selectionRect,
    dragPreviewObject,
    dragPreviewObjects,
    draggedObject,
    showShortcuts,
    setShowShortcuts,
    setIsShiftPressed,
    startSpacePan,
    endSpacePan,
    clearConstraintMode,
    clearTriangleVertices,
    screenToWorld,
    pointerPolicyRef,
    pointerPolicyInput,
    observeCanvasPointerDown,
    inputPreferences,
    canvasPointerHandlers,
  };
}
