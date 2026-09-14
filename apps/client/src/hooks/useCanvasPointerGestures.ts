import { useCallback } from 'react';
import { generateId } from '@/lib/utils';
import { useDrawingStore } from '@/store/drawingStore';
import type { StrokeData } from '@/types/socket';
import { getPointerSamples } from '@/lib/canvasPointer';
import {
  applyObjectDrag,
  draggedObjectPreviews,
  extendSelectionRect,
  marqueeSelectedIds,
  planSelectClick,
  planSelectPointerDown,
} from '@/lib/canvasSelectGesture';
import { sendRetainedObjects } from '@/lib/canvasRendererObject';
import { eraseObjectFromScene } from '@/lib/canvasErase';
import { createTriangleFromVertices } from '@/lib/canvasShapeCommit';
import { fitDrawingFromStroke } from '@/lib/canvasShapeFit';
import { createFreehandTapObject } from '@/lib/freehandStroke';
import { CANVAS_BG_COLORS, type CanvasThemeName } from '@/lib/canvasTheme';
import { appendLiveStrokeSegments } from '@/lib/canvasLiveStroke';
import { planLiveStrokeCommit, strokeCommitSteps } from '@/lib/canvasStrokeCommit';
import { planPointerDownRoute } from '@/lib/canvasGesturePlan';
import {
  isLiveInkTool,
  planDraggedShapeCommit,
  planDrawToolPointerDown,
  previewForShapeDrag,
  shouldPlaceInkTap,
} from '@/lib/canvasDrawGesture';
import {
  canPointerDraw,
  interruptPointers,
  isTouchInput,
  type CanvasInputPreferences,
  type PointerPolicyInput,
} from '@/lib/canvasInputPolicy';
import type { CanvasPresentation } from '@/lib/canvasPresentation';
import type { useCanvasDrawingSessionState } from '@/hooks/useCanvasDrawingSessionState';
import type { useCanvasViewportSession } from '@/hooks/useCanvasViewportSession';

type SessionState = ReturnType<typeof useCanvasDrawingSessionState>;
type ViewportSession = ReturnType<typeof useCanvasViewportSession>;

export function useCanvasPointerGestures({
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
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  presentation: CanvasPresentation;
  viewport: ViewportSession;
  canDraw: boolean;
  theme: CanvasThemeName;
  emitCursor: (x: number, y: number) => void;
  openTextInput: (clientX: number, clientY: number, worldX: number, worldY: number) => void;
  textInputBlocked: boolean;
  toast: (opts: { title: string; description: string; variant: 'destructive' }) => unknown;
  session: SessionState;
  screenToWorld: (clientX: number, clientY: number) => { x: number; y: number };
  enqueueWorkerStroke: (stroke: StrokeData) => void;
  inputPreferences: CanvasInputPreferences;
  pointerPolicyInput: (
    event: Pick<PointerEvent, 'pointerType' | 'pointerId'>,
    touches?: number,
  ) => PointerPolicyInput;
}) {
  const currentTool = useDrawingStore((s) => s.currentTool);
  const eraserMode = useDrawingStore((s) => s.eraserMode);
  const brushSize = useDrawingStore((s) => s.brushSize);
  const brushColor = useDrawingStore((s) => s.brushColor);
  const brushOpacity = useDrawingStore((s) => s.brushOpacity);
  const triangleMode = useDrawingStore((s) => s.triangleMode);
  const starPoints = useDrawingStore((s) => s.starPoints);
  const objects = useDrawingStore((s) => s.objects);
  const addObject = useDrawingStore((s) => s.addObject);
  const removeObject = useDrawingStore((s) => s.removeObject);
  const setObjects = useDrawingStore((s) => s.setObjects);
  const saveHistory = useDrawingStore((s) => s.saveHistory);
  const autoDrawing = useDrawingStore((s) => s.autoDrawing);
  const selectedObjectIds = useDrawingStore((s) => s.selectedObjectIds);
  const setSelectedObject = useDrawingStore((s) => s.setSelectedObject);
  const setSelectedObjects = useDrawingStore((s) => s.setSelectedObjects);
  const requestFullRedraw = useDrawingStore((s) => s.requestFullRedraw);
  const viewX = useDrawingStore((s) => s.viewX);
  const viewY = useDrawingStore((s) => s.viewY);
  const setView = useDrawingStore((s) => s.setView);

  const {
    setDragPreviewObject,
    setDragPreviewObjects,
    isDrawing,
    setIsDrawing,
    lastPoint,
    setLastPoint,
    currentStroke,
    setCurrentStroke,
    startPoint,
    setStartPoint,
    setPreviewDrawing,
    previewDrawing,
    isShiftPressed,
    isConstraintMode,
    isPanning,
    setIsPanning,
    panStart,
    setPanStart,
    isSpacePan,
    triangleVertices,
    setTriangleVertices,
    draggedObject,
    setDraggedObject,
    selectionRect,
    setSelectionRect,
    draggedObjectsRef,
    activeDragRef,
    dragRedrawScheduledRef,
    panViewportScheduledRef,
    currentPanViewRef,
    pointerPolicyRef,
    activeCanvasPointerRef,
    activeCanvasPointersRef,
    canvasPointerMovedRef,
    lastCanvasPointerTypeRef,
    lastCanvasPointerPressureRef,
    strokeGroupRef,
  } = session;

  const startDrawing = useCallback(
    (e: React.PointerEvent | React.MouseEvent | PointerEvent) => {
      if ('pointerType' in e && isTouchInput(e)) {
        const input = pointerPolicyInput(e);
        if (!canPointerDraw(inputPreferences, pointerPolicyRef.current, input)) return;
      }
      if (!canDraw && currentTool !== 'hand' && currentTool !== 'select') {
        toast({
          title: 'View Only',
          description: "You don't have permission to edit this project.",
          variant: 'destructive',
        });
        return;
      }

      if (textInputBlocked) return;

      const worldPos = screenToWorld(e.clientX, e.clientY);
      if ('pointerId' in e) {
        activeCanvasPointerRef.current = e.pointerId;
        try {
          if (e.currentTarget instanceof Element) {
            e.currentTarget.setPointerCapture(e.pointerId);
          }
        } catch {
          // ignore
        }
      }

      const route = planPointerDownRoute({
        currentTool,
        isSpacePan,
        button: 'button' in e ? e.button : 0,
      });
      if (route === 'select') {
        const plan = planSelectPointerDown({
          objects,
          world: worldPos,
          shiftKey: e.shiftKey,
          selectedObjectIds,
        });
        if (plan.kind === 'shift-select') {
          setSelectedObjects(plan.selectedIds);
          return;
        }
        if (plan.kind === 'hit') {
          if (plan.selectedIds) setSelectedObjects(plan.selectedIds);
          if (plan.haptic && 'pointerType' in e && isTouchInput(e) && 'vibrate' in navigator) {
            navigator.vibrate(12);
          }
          if (!plan.drag) return;
          const previews = draggedObjectPreviews(objects, plan.drag.ids);
          activeDragRef.current = plan.drag;
          setDragPreviewObject(previews.find((object) => object.id === plan.drag?.id) ?? null);
          setDragPreviewObjects(previews);
          setDraggedObject(plan.drag);
          saveHistory();
          return;
        }
        if (plan.clearPrimarySelection) setSelectedObject(undefined);
        setSelectionRect(plan.rect);
        setIsDrawing(true);
        return;
      }

      if (route === 'pan') {
        setIsPanning(true);
        setPanStart({ x: e.clientX, y: e.clientY, viewX, viewY });
        return;
      }

      if (route === 'ignore') {
        return;
      }

      const toolPlan = planDrawToolPointerDown({
        currentTool,
        eraserMode,
        triangleMode,
        triangleVertices,
        objects,
        world: worldPos,
      });
      if (toolPlan.kind === 'object-erase') {
        saveHistory();
        removeObject(toolPlan.removed.id);
        eraseObjectFromScene(
          (message) => presentation.send(message),
          toolPlan.removed,
          toolPlan.remaining,
        );
        return;
      }
      if (toolPlan.kind === 'start-ink') {
        setIsDrawing(true);
        setLastPoint(worldPos);
        setCurrentStroke([]);
        strokeGroupRef.current = generateId();
        return;
      }
      if (toolPlan.kind === 'start-shape') {
        setIsDrawing(true);
        setStartPoint(worldPos);
        setLastPoint(worldPos);
        saveHistory();
        return;
      }
      if (toolPlan.kind === 'open-text') {
        openTextInput(e.clientX, e.clientY, worldPos.x, worldPos.y);
        return;
      }
      if (toolPlan.kind === 'place-triangle-vertex') {
        setTriangleVertices(toolPlan.vertices);
        return;
      }
      if (toolPlan.kind === 'commit-triangle') {
        const triangleObject = createTriangleFromVertices(
          toolPlan.vertices,
          { color: brushColor, size: brushSize, alpha: brushOpacity },
          useDrawingStore.getState().drawingFilled,
          generateId(),
        );
        saveHistory();
        addObject(triangleObject);
        sendRetainedObjects((message) => presentation.send(message), [triangleObject]);
        setTriangleVertices([]);
      }
    },
    [
      activeCanvasPointerRef,
      activeDragRef,
      addObject,
      brushColor,
      brushOpacity,
      brushSize,
      canDraw,
      currentTool,
      eraserMode,
      inputPreferences,
      isSpacePan,
      objects,
      openTextInput,
      pointerPolicyInput,
      pointerPolicyRef,
      presentation,
      removeObject,
      saveHistory,
      screenToWorld,
      selectedObjectIds,
      setCurrentStroke,
      setDragPreviewObject,
      setDragPreviewObjects,
      setDraggedObject,
      setIsDrawing,
      setIsPanning,
      setLastPoint,
      setPanStart,
      setSelectedObject,
      setSelectedObjects,
      setSelectionRect,
      setStartPoint,
      setTriangleVertices,
      strokeGroupRef,
      textInputBlocked,
      toast,
      triangleMode,
      triangleVertices,
      viewX,
      viewY,
    ],
  );

  const draw = useCallback(
    (e: React.PointerEvent | PointerEvent) => {
      canvasPointerMovedRef.current = true;
      if (canvasRef.current) {
        const worldPos = screenToWorld(e.clientX, e.clientY);
        emitCursor(worldPos.x, worldPos.y);
      }

      if (isPanning && panStart) {
        const constrained = viewport.panFromOrigin(
          panStart,
          -(e.clientX - panStart.x),
          -(e.clientY - panStart.y),
        );
        if (!constrained) return;
        currentPanViewRef.current = constrained;
        if (!panViewportScheduledRef.current) {
          panViewportScheduledRef.current = true;
          requestAnimationFrame(() => {
            panViewportScheduledRef.current = false;
            const latestView = currentPanViewRef.current;
            if (latestView) viewport.applyPan(latestView);
          });
        }
        return;
      }

      if (selectionRect) {
        const worldPos = screenToWorld(e.clientX, e.clientY);
        setSelectionRect((current) => (current ? extendSelectionRect(current, worldPos) : current));
        return;
      }

      const activeDrag = activeDragRef.current ?? draggedObject;
      if (activeDrag) {
        const worldPos = screenToWorld(e.clientX, e.clientY);
        const updatedObjects = applyObjectDrag(
          draggedObjectsRef.current || objects,
          activeDrag,
          worldPos,
        );
        if (updatedObjects) {
          draggedObjectsRef.current = updatedObjects;
          if (!dragRedrawScheduledRef.current) {
            dragRedrawScheduledRef.current = true;
            requestAnimationFrame(() => {
              dragRedrawScheduledRef.current = false;
              if (draggedObjectsRef.current) {
                const previews = draggedObjectPreviews(draggedObjectsRef.current, activeDrag.ids);
                const updatedObj = previews.find((object) => object.id === activeDrag.id);
                if (updatedObj) {
                  setDragPreviewObject(updatedObj);
                  setDragPreviewObjects(previews);
                  sendRetainedObjects((message) => presentation.send(message), previews);
                }
              }
            });
          }
        }
        return;
      }
      if (!isDrawing) return;
      const events = getPointerSamples(e instanceof PointerEvent ? e : e.nativeEvent);

      if (isLiveInkTool(currentTool, eraserMode)) {
        const { segments, lastPoint: nextLast } = appendLiveStrokeSegments({
          samples: events,
          lastPoint,
          toWorld: screenToWorld,
          groupId: strokeGroupRef.current,
          color: currentTool === 'eraser' ? CANVAS_BG_COLORS[theme] : brushColor,
          alpha: brushOpacity,
          brushSize,
        });
        for (const stroke of segments) {
          enqueueWorkerStroke(stroke);
        }
        if (segments.length > 0) {
          setCurrentStroke((prev) => [...prev, ...segments]);
        }
        if (nextLast) setLastPoint(nextLast);
        return;
      }

      if (!startPoint) return;
      const lastEv = events[events.length - 1];
      const preview = previewForShapeDrag({
        currentTool,
        triangleMode,
        start: startPoint,
        end: screenToWorld(lastEv.clientX, lastEv.clientY),
        constrained: isShiftPressed || isConstraintMode,
        style: { color: brushColor, size: brushSize, alpha: brushOpacity },
      });
      if (preview) setPreviewDrawing(preview);
    },
    [
      activeDragRef,
      brushColor,
      brushOpacity,
      brushSize,
      canvasPointerMovedRef,
      canvasRef,
      currentPanViewRef,
      currentTool,
      dragRedrawScheduledRef,
      draggedObject,
      draggedObjectsRef,
      emitCursor,
      enqueueWorkerStroke,
      eraserMode,
      isConstraintMode,
      isDrawing,
      isPanning,
      isShiftPressed,
      lastPoint,
      objects,
      panStart,
      panViewportScheduledRef,
      presentation,
      screenToWorld,
      selectionRect,
      setCurrentStroke,
      setDragPreviewObject,
      setDragPreviewObjects,
      setLastPoint,
      setPreviewDrawing,
      setSelectionRect,
      startPoint,
      strokeGroupRef,
      theme,
      triangleMode,
      viewport,
    ],
  );

  const handleCanvasClick = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      const pointerType = lastCanvasPointerTypeRef.current ?? 'mouse';
      const input = { pointerType };
      if (
        isTouchInput(input) &&
        !canPointerDraw(inputPreferences, pointerPolicyRef.current, input)
      ) {
        lastCanvasPointerTypeRef.current = null;
        return;
      }
      lastCanvasPointerTypeRef.current = null;

      if ((currentTool === 'select' || currentTool === 'move') && !canvasPointerMovedRef.current) {
        const plan = planSelectClick({
          objects,
          world: screenToWorld(event.clientX, event.clientY),
          shiftKey: event.shiftKey,
          selectedObjectIds,
        });
        if (plan.kind === 'clear') setSelectedObject(undefined);
        if (plan.kind === 'select') setSelectedObjects(plan.selectedIds);
        return;
      }

      if (
        shouldPlaceInkTap({
          currentTool,
          canDraw,
          pointerMoved: canvasPointerMovedRef.current,
        })
      ) {
        const worldPos = screenToWorld(event.clientX, event.clientY);
        const drawingObject = createFreehandTapObject({
          id: generateId(),
          x: worldPos.x,
          y: worldPos.y,
          baseSize: brushSize,
          pointerType,
          pressure: lastCanvasPointerPressureRef.current,
          color: brushColor,
          alpha: brushOpacity,
        });
        saveHistory();
        addObject(drawingObject);
        sendRetainedObjects((message) => presentation.send(message), [drawingObject]);
        return;
      }

      if (currentTool !== 'triangle' || triangleMode !== 'custom') return;
      startDrawing(event);
    },
    [
      addObject,
      brushColor,
      brushOpacity,
      brushSize,
      canDraw,
      canvasPointerMovedRef,
      currentTool,
      inputPreferences,
      lastCanvasPointerPressureRef,
      lastCanvasPointerTypeRef,
      objects,
      pointerPolicyRef,
      presentation,
      saveHistory,
      screenToWorld,
      selectedObjectIds,
      setSelectedObject,
      setSelectedObjects,
      startDrawing,
      triangleMode,
    ],
  );

  const stopDrawing = useCallback(() => {
    if (selectionRect) {
      setSelectedObjects(marqueeSelectedIds(objects, selectionRect));
      setSelectionRect(null);
      setIsDrawing(false);
      return;
    }

    if (activeDragRef.current ?? draggedObject) {
      if (draggedObjectsRef.current) {
        setObjects(draggedObjectsRef.current);
        draggedObjectsRef.current = null;
      }
      activeDragRef.current = null;
      setDragPreviewObject(null);
      setDragPreviewObjects(null);
      setDraggedObject(null);
      requestAnimationFrame(() => {
        requestFullRedraw();
      });
      return;
    }

    if (isPanning || currentTool === 'hand' || isSpacePan) {
      if (currentPanViewRef.current) {
        setView(currentPanViewRef.current.x, currentPanViewRef.current.y);
        currentPanViewRef.current = null;
      }
      setIsPanning(false);
      setPanStart(null);
      if (currentTool === 'hand' || isSpacePan || !isDrawing) {
        return;
      }
    }
    if (!isDrawing) return;
    presentation.flushStrokes();

    if (isLiveInkTool(currentTool, eraserMode)) {
      const planned = planLiveStrokeCommit({
        currentStroke,
        currentTool,
        autoDrawing,
        style: {
          color: currentTool === 'eraser' ? CANVAS_BG_COLORS[theme] : brushColor,
          size: brushSize,
          alpha: brushOpacity,
        },
        drawingFilled: useDrawingStore.getState().drawingFilled,
        generateId,
        detectDrawing: (points) =>
          fitDrawingFromStroke(points, useDrawingStore.getState().autoDrawingThresholds),
        liveGroupId: strokeGroupRef.current,
      });
      for (const step of strokeCommitSteps(planned, {
        themeBg: CANVAS_BG_COLORS[theme],
        brushSize,
        liveGroupId: strokeGroupRef.current,
      })) {
        if (step.kind === 'retain') {
          addObject(step.object);
          saveHistory();
        } else {
          presentation.send(step.command);
        }
      }
    } else {
      const drawingObject = planDraggedShapeCommit({
        currentTool,
        triangleMode,
        start: startPoint,
        preview: previewDrawing,
        style: { color: brushColor, size: brushSize, alpha: brushOpacity },
        filled: useDrawingStore.getState().drawingFilled,
        generateId,
        starPoints,
      });
      if (drawingObject) {
        addObject(drawingObject);
        sendRetainedObjects((message) => presentation.send(message), [drawingObject]);
      }
    }

    setIsDrawing(false);
    setLastPoint(null);
    setCurrentStroke([]);
    strokeGroupRef.current = null;
    setStartPoint(null);
    setPreviewDrawing(null);
    activeCanvasPointerRef.current = null;
  }, [
    activeCanvasPointerRef,
    activeDragRef,
    addObject,
    autoDrawing,
    brushColor,
    brushOpacity,
    brushSize,
    currentPanViewRef,
    currentStroke,
    currentTool,
    draggedObject,
    draggedObjectsRef,
    eraserMode,
    isDrawing,
    isPanning,
    isSpacePan,
    objects,
    presentation,
    previewDrawing,
    requestFullRedraw,
    saveHistory,
    selectionRect,
    setCurrentStroke,
    setDragPreviewObject,
    setDragPreviewObjects,
    setDraggedObject,
    setIsDrawing,
    setIsPanning,
    setLastPoint,
    setObjects,
    setPanStart,
    setPreviewDrawing,
    setSelectedObjects,
    setSelectionRect,
    setStartPoint,
    setView,
    starPoints,
    startPoint,
    strokeGroupRef,
    theme,
    triangleMode,
  ]);

  const cancelActiveGesture = useCallback(() => {
    const groupId = strokeGroupRef.current;
    if (groupId) {
      presentation.flushStrokes();
      presentation.send({ type: 'remove-group', groupId });
    }
    setIsDrawing(false);
    setLastPoint(null);
    setCurrentStroke([]);
    setStartPoint(null);
    setPreviewDrawing(null);
    setSelectionRect(null);
    setIsPanning(false);
    setPanStart(null);
    currentPanViewRef.current = null;
    activeDragRef.current = null;
    draggedObjectsRef.current = null;
    setDraggedObject(null);
    setDragPreviewObject(null);
    setDragPreviewObjects(null);
    strokeGroupRef.current = null;
    activeCanvasPointerRef.current = null;
    activeCanvasPointersRef.current.clear();
    interruptPointers(pointerPolicyRef.current);
  }, [
    activeCanvasPointerRef,
    activeCanvasPointersRef,
    activeDragRef,
    currentPanViewRef,
    draggedObjectsRef,
    pointerPolicyRef,
    presentation,
    setCurrentStroke,
    setDragPreviewObject,
    setDragPreviewObjects,
    setDraggedObject,
    setIsDrawing,
    setIsPanning,
    setLastPoint,
    setPanStart,
    setPreviewDrawing,
    setSelectionRect,
    setStartPoint,
    strokeGroupRef,
  ]);


  return { startDrawing, draw, stopDrawing, handleCanvasClick, cancelActiveGesture };
}
