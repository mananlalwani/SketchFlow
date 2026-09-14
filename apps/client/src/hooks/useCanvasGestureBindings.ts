import { useCallback, useEffect, type MutableRefObject, type RefObject } from 'react';
import { useGesture } from '@use-gesture/react';
import { planSessionDrag, shouldInterruptTouchForPen } from '@/lib/canvasGesturePlan';
import { replayLostPointerCapture } from '@/lib/canvasPointer';
import {
  canPointerPan,
  isStylusInput,
  isTouchInput,
  releasePointer,
  shouldCancelActiveCanvasGesture,
  shouldSuppressTouch,
  type CanvasInputPreferences,
  type PointerPolicyInput,
  type PointerPolicyState,
} from '@/lib/canvasInputPolicy';
import type { useCanvasViewportSession } from '@/hooks/useCanvasViewportSession';

type ViewportSession = ReturnType<typeof useCanvasViewportSession>;

interface UseCanvasGestureBindingsOptions {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  viewport: ViewportSession;
  zoom: number;
  viewX: number;
  viewY: number;
  currentTool: string;
  triangleMode: string;
  canDraw: boolean;
  isDrawing: boolean;
  isPanning: boolean;
  isSpacePan: boolean;
  panStart: { x: number; y: number; viewX: number; viewY: number } | null;
  setIsPanning: (value: boolean) => void;
  setPanStart: (value: { x: number; y: number; viewX: number; viewY: number } | null) => void;
  pointerPolicyRef: MutableRefObject<PointerPolicyState>;
  pointerPolicyInput: (
    event: Pick<PointerEvent, 'pointerType' | 'pointerId'>,
    touches?: number,
  ) => PointerPolicyInput;
  observeCanvasPointerDown: (input: PointerPolicyInput) => void;
  inputPreferences: CanvasInputPreferences;
  activeDragPresent: () => boolean;
  startDrawing: (event: PointerEvent) => void;
  draw: (event: PointerEvent) => void;
  stopDrawing: () => void;
  handleCanvasClick: (event: React.MouseEvent<HTMLCanvasElement>) => void;
  cancelActiveGesture: () => void;
  activeCanvasPointerRef: MutableRefObject<number | null>;
  activeCanvasPointersRef: MutableRefObject<Map<number, string>>;
  lastCanvasPointerTypeRef: MutableRefObject<string | null>;
  lastCanvasPointerPressureRef: MutableRefObject<number>;
  canvasPointerMovedRef: MutableRefObject<boolean>;
}

export function useCanvasGestureBindings({
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
  activeDragPresent,
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
}: UseCanvasGestureBindingsOptions) {
  const cancelIfNeeded = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>, wasActivePen: boolean) =>
      shouldCancelActiveCanvasGesture({
        pointerType: event.pointerType,
        pointerId: event.pointerId,
        activePointerId: activeCanvasPointerRef.current,
        wasActivePen,
        remainingPenCount: pointerPolicyRef.current.activePenPointers.size,
        isPanning,
        isDrawing,
        hasActiveDrag: activeDragPresent(),
      }),
    [activeCanvasPointerRef, activeDragPresent, isDrawing, isPanning, pointerPolicyRef],
  );

  const handleCanvasPointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const input = pointerPolicyInput(event);
      if (
        shouldInterruptTouchForPen({
          isStylus: isStylusInput(event),
          hasActivePen: pointerPolicyRef.current.activePenPointers.size > 0,
          hasActiveTouch: Array.from(activeCanvasPointersRef.current.values()).includes('touch'),
        })
      ) {
        cancelActiveGesture();
      }
      lastCanvasPointerTypeRef.current = event.pointerType;
      lastCanvasPointerPressureRef.current = event.pressure;
      canvasPointerMovedRef.current = false;
      activeCanvasPointersRef.current.set(event.pointerId, event.pointerType);
      observeCanvasPointerDown(input);
    },
    [
      activeCanvasPointersRef,
      cancelActiveGesture,
      canvasPointerMovedRef,
      lastCanvasPointerPressureRef,
      lastCanvasPointerTypeRef,
      observeCanvasPointerDown,
      pointerPolicyInput,
      pointerPolicyRef,
    ],
  );

  const handleCanvasPointerUp = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      releasePointer(pointerPolicyRef.current, pointerPolicyInput(event));
      activeCanvasPointersRef.current.delete(event.pointerId);
      if (activeCanvasPointerRef.current === event.pointerId) {
        activeCanvasPointerRef.current = null;
      }
    },
    [activeCanvasPointerRef, activeCanvasPointersRef, pointerPolicyInput, pointerPolicyRef],
  );

  const handleCanvasPointerCancel = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const wasActivePen = pointerPolicyRef.current.activePenPointers.has(event.pointerId);
      releasePointer(pointerPolicyRef.current, pointerPolicyInput(event));
      activeCanvasPointersRef.current.delete(event.pointerId);
      lastCanvasPointerTypeRef.current = null;
      if (cancelIfNeeded(event, wasActivePen)) cancelActiveGesture();
    },
    [
      activeCanvasPointersRef,
      cancelActiveGesture,
      cancelIfNeeded,
      lastCanvasPointerTypeRef,
      pointerPolicyInput,
      pointerPolicyRef,
    ],
  );

  const handleCanvasLostPointerCapture = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const wasActivePen = pointerPolicyRef.current.activePenPointers.has(event.pointerId);
      releasePointer(pointerPolicyRef.current, pointerPolicyInput(event));
      activeCanvasPointersRef.current.delete(event.pointerId);
      lastCanvasPointerTypeRef.current = null;
      if (cancelIfNeeded(event, wasActivePen)) cancelActiveGesture();
      replayLostPointerCapture(event.currentTarget, event);
    },
    [
      activeCanvasPointersRef,
      cancelActiveGesture,
      cancelIfNeeded,
      lastCanvasPointerTypeRef,
      pointerPolicyInput,
      pointerPolicyRef,
    ],
  );

  useEffect(() => {
    const interrupt = () => cancelActiveGesture();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') interrupt();
    };
    window.addEventListener('blur', interrupt);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('blur', interrupt);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [cancelActiveGesture]);

  useGesture(
    {
      onDrag: ({ active, xy: [clientX, clientY], event, touches, tap }) => {
        const nativeEvent = event instanceof PointerEvent ? event : null;
        const pointerInput = nativeEvent
          ? pointerPolicyInput(nativeEvent, touches)
          : { pointerType: 'mouse', touches };
        if (nativeEvent) {
          if (active) observeCanvasPointerDown(pointerInput);
          else releasePointer(pointerPolicyRef.current, pointerInput);
        }
        const touchSuppressed =
          nativeEvent !== null &&
          isTouchInput(nativeEvent) &&
          shouldSuppressTouch(inputPreferences, pointerPolicyRef.current, pointerInput);
        const touchCanPan =
          nativeEvent !== null &&
          isTouchInput(nativeEvent) &&
          canPointerPan(inputPreferences, pointerPolicyRef.current, pointerInput);

        const action = planSessionDrag({
          skipCustomTriangle: currentTool === 'triangle' && triangleMode === 'custom',
          tap,
          touchBlocked: Boolean(touchSuppressed && !touchCanPan),
          shouldPan: currentTool === 'hand' || isSpacePan || touches > 1 || touchCanPan === true,
          isPanning,
          active,
          hasPanOrigin: Boolean(panStart),
          nativeMissing: nativeEvent === null,
          hasActiveDrag: activeDragPresent(),
          isDrawing,
          canStartDraw: canDraw || currentTool === 'select',
        });
        if (action === 'ignore') return;
        if (action === 'pan-start') {
          setIsPanning(true);
          setPanStart({ x: clientX, y: clientY, viewX, viewY });
          return;
        }
        if (action === 'pan-move' && panStart) {
          const constrained = viewport.panFromOrigin(
            panStart,
            -(clientX - panStart.x),
            -(clientY - panStart.y),
          );
          if (constrained) viewport.applyPan(constrained);
          return;
        }
        if (action === 'pan-end') {
          setIsPanning(false);
          setPanStart(null);
          return;
        }
        if (!nativeEvent) return;
        if (action === 'draw-move') draw(nativeEvent);
        else if (action === 'draw-start') startDrawing(nativeEvent);
        else if (action === 'draw-stop') stopDrawing();
      },
      onPinch: ({ origin: [cx, cy], offset: [s], first, memo }) => {
        if (pointerPolicyRef.current.activePenPointers.size > 0) return memo;
        if (first) return { initialZoom: zoom };
        viewport.zoomAtClient(cx, cy, memo.initialZoom * s);
        return memo;
      },
      onWheel: ({ event, active, delta: [dx, dy], ctrlKey }) => {
        event.preventDefault();
        if (ctrlKey) {
          if (!(event instanceof WheelEvent)) return;
          viewport.zoomAtClient(event.clientX, event.clientY, zoom * (dy > 0 ? 0.9 : 1.1));
        } else if (active) {
          viewport.panScreenDelta(dx, dy);
        }
      },
    },
    {
      target: canvasRef,
      eventOptions: { passive: false },
      drag: { filterTaps: true, threshold: 3 },
      pinch: { scaleBounds: { min: 0.1, max: 5 }, modifierKey: null },
    },
  );

  return {
    onPointerDown: handleCanvasPointerDown,
    onPointerUp: handleCanvasPointerUp,
    onPointerCancel: handleCanvasPointerCancel,
    onLostPointerCapture: handleCanvasLostPointerCapture,
    onClick: handleCanvasClick,
  };
}
