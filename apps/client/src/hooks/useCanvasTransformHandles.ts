import { useEffect, type MutableRefObject, type PointerEvent as ReactPointerEvent } from 'react';
import type { DrawingObject } from '@/store/drawingStore';
import {
  patchFromTransformHandle,
  type TransformHandle,
} from '@/lib/canvasObjectTransform';
import {
  canPointerDraw,
  isTouchInput,
  releasePointer,
  type CanvasInputPreferences,
  type PointerPolicyInput,
  type PointerPolicyState,
} from '@/lib/canvasInputPolicy';

export interface ActiveTransform {
  handle: TransformHandle;
  object: DrawingObject;
  preserveAspectRatio: boolean;
  pointerId: number;
}

interface UseCanvasTransformHandlesOptions {
  activeTransform: ActiveTransform | null;
  setActiveTransform: (value: ActiveTransform | null) => void;
  selectedObject?: DrawingObject;
  projectRole?: string | null;
  screenToWorld: (clientX: number, clientY: number) => { x: number; y: number };
  updateObject: (id: string, patch: Partial<DrawingObject>) => void;
  saveHistory: () => void;
  pointerPolicyRef: MutableRefObject<PointerPolicyState>;
  pointerPolicyInput: (
    event: Pick<PointerEvent, 'pointerType' | 'pointerId'>,
    touches?: number,
  ) => PointerPolicyInput;
  observeCanvasPointerDown: (input: PointerPolicyInput) => void;
  inputPreferences: CanvasInputPreferences;
}

export function useCanvasTransformHandles({
  activeTransform,
  setActiveTransform,
  selectedObject,
  projectRole,
  screenToWorld,
  updateObject,
  saveHistory,
  pointerPolicyRef,
  pointerPolicyInput,
  observeCanvasPointerDown,
  inputPreferences,
}: UseCanvasTransformHandlesOptions) {
  useEffect(() => {
    if (!activeTransform) return;
    const { object, handle, preserveAspectRatio, pointerId } = activeTransform;

    const onMove = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      const patch = patchFromTransformHandle(
        handle,
        screenToWorld(event.clientX, event.clientY),
        object,
        preserveAspectRatio,
      );
      if (patch) updateObject(object.id, patch);
    };
    const onEnd = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      releasePointer(pointerPolicyRef.current, pointerPolicyInput(event));
      setActiveTransform(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
    window.addEventListener('lostpointercapture', onEnd);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
      window.removeEventListener('lostpointercapture', onEnd);
    };
  }, [
    activeTransform,
    pointerPolicyInput,
    pointerPolicyRef,
    screenToWorld,
    setActiveTransform,
    updateObject,
  ]);

  const startTransform = (event: ReactPointerEvent<SVGElement>, handle: TransformHandle) => {
    if (!selectedObject || selectedObject.locked || projectRole === 'viewer') return;
    const input = pointerPolicyInput(event);
    observeCanvasPointerDown(input);
    if (isTouchInput(event) && !canPointerDraw(inputPreferences, pointerPolicyRef.current, input)) {
      releasePointer(pointerPolicyRef.current, input);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    saveHistory();
    setActiveTransform({
      handle,
      object: selectedObject,
      preserveAspectRatio: event.shiftKey,
      pointerId: event.pointerId,
    });
  };

  return { startTransform };
}
