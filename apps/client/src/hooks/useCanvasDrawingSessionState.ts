import { useRef, useState } from 'react';
import type { DrawingObject } from '@/store/drawingStore';
import type { StrokeData } from '@/types/socket';
import type { ObjectDragSession, SelectionRect } from '@/lib/canvasSelectGesture';
import type { ShapePreview } from '@/lib/canvasDrawGesture';
import { createPointerPolicyState } from '@/lib/canvasInputPolicy';

export function useCanvasDrawingSessionState() {
  const [dragPreviewObject, setDragPreviewObject] = useState<DrawingObject | null>(null);
  const [dragPreviewObjects, setDragPreviewObjects] = useState<DrawingObject[] | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [lastPoint, setLastPoint] = useState<{ x: number; y: number } | null>(null);
  const [currentStroke, setCurrentStroke] = useState<StrokeData[]>([]);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [previewDrawing, setPreviewDrawing] = useState<ShapePreview | null>(null);
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const [isConstraintMode, setIsConstraintMode] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{
    x: number;
    y: number;
    viewX: number;
    viewY: number;
  } | null>(null);
  const [isSpacePan, setIsSpacePan] = useState(false);
  const [triangleVertices, setTriangleVertices] = useState<{ x: number; y: number }[]>([]);
  const [draggedObject, setDraggedObject] = useState<ObjectDragSession | null>(null);
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const draggedObjectsRef = useRef<DrawingObject[] | null>(null);
  const activeDragRef = useRef<ObjectDragSession | null>(null);
  const dragRedrawScheduledRef = useRef(false);
  const panViewportScheduledRef = useRef(false);
  const currentPanViewRef = useRef<{ x: number; y: number } | null>(null);
  const pointerPolicyRef = useRef(createPointerPolicyState());
  const activeCanvasPointerRef = useRef<number | null>(null);
  const activeCanvasPointersRef = useRef(new Map<number, string>());
  const canvasPointerMovedRef = useRef(false);
  const lastCanvasPointerTypeRef = useRef<string | null>(null);
  const lastCanvasPointerPressureRef = useRef(0);
  const strokeGroupRef = useRef<string | null>(null);

  return {
    dragPreviewObject,
    setDragPreviewObject,
    dragPreviewObjects,
    setDragPreviewObjects,
    isDrawing,
    setIsDrawing,
    lastPoint,
    setLastPoint,
    currentStroke,
    setCurrentStroke,
    startPoint,
    setStartPoint,
    previewDrawing,
    setPreviewDrawing,
    isShiftPressed,
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
    setDraggedObject,
    selectionRect,
    setSelectionRect,
    showShortcuts,
    setShowShortcuts,
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
  };
}
