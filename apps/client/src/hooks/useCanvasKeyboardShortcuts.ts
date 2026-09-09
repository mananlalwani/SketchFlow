import { useEffect, type MutableRefObject, type RefObject } from 'react';
import { useDrawingStore } from '@/store/drawingStore';
import { getCanvasToolShortcut, isEditableKeyboardTarget } from '@/lib/canvasKeyboard';
import { postRendererViewport } from '@/lib/canvasRendererViewport';
import type { RendererWorkerPort } from '@/lib/canvasRendererViewport';
import { zoomViewportAtPoint } from '@/lib/canvasViewport';
import type { CanvasPresentation } from '@/lib/canvasPresentation';

export type { RendererWorkerPort } from '@/lib/canvasRendererViewport';

interface CanvasKeyboardShortcutOptions {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  workerRef: MutableRefObject<RendererWorkerPort | null>;
  presentation?: CanvasPresentation;
  setIsShiftPressed: (isPressed: boolean) => void;
  onSpacePanStart: () => void;
  onSpacePanEnd: () => void;
  setShowShortcuts: (show: boolean) => void;
}

/** Owns global canvas shortcuts and keeps reset/zoom actions synchronized with the renderer. */
export function useCanvasKeyboardShortcuts({
  canvasRef,
  workerRef,
  presentation,
  setIsShiftPressed,
  onSpacePanStart,
  onSpacePanEnd,
  setShowShortcuts,
}: CanvasKeyboardShortcutOptions) {
  useEffect(() => {
    const zoomAtCanvasCenter = (factor: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const state = useDrawingStore.getState();
      const rect = canvas.getBoundingClientRect();
      const viewport = zoomViewportAtPoint({
        zoom: state.zoom,
        viewX: state.viewX,
        viewY: state.viewY,
        nextZoom: state.zoom * factor,
        focalX: rect.width / 2,
        focalY: rect.height / 2,
        canvasWidth: rect.width,
        canvasHeight: rect.height,
      });
      state.setZoom(viewport.zoom);
      state.setView(viewport.x, viewport.y);
      if (presentation) {
        presentation.setViewport(rect, {
          zoom: viewport.zoom,
          viewX: viewport.x,
          viewY: viewport.y,
        });
      } else {
        postRendererViewport(workerRef.current, rect, {
          zoom: viewport.zoom,
          viewX: viewport.x,
          viewY: viewport.y,
        });
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const state = useDrawingStore.getState();
      if (event.key === 'Shift') setIsShiftPressed(true);
      if (isEditableKeyboardTarget(event.target)) return;

      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        if (state.selectedObjectIds.length > 0) {
          const selectedIds = new Set(state.selectedObjectIds);
          const hasLockedSelection = state.objects.some(
            (object) => selectedIds.has(object.id) && object.locked,
          );
          if (state.projectRole !== 'viewer' && !hasLockedSelection) {
            state.saveHistory();
            state.setObjects(state.objects.filter((object) => !selectedIds.has(object.id)));
            state.setSelectedObject(undefined);
            state.requestFullRedraw();
          }
        } else if (window.confirm('Are you sure you want to clear the canvas?')) {
          state.clearCanvas();
          if (presentation) presentation.clear();
          else workerRef.current?.postMessage({ type: 'clear' });
        }
        return;
      }

      if (event.ctrlKey || event.metaKey) {
        if (event.key.toLowerCase() === 'z') {
          event.preventDefault();
          if (event.shiftKey) {
            state.redo();
          } else {
            state.undo();
          }
        } else if (event.key.toLowerCase() === 'y') {
          event.preventDefault();
          state.redo();
        } else if (event.key === '=' || event.key === '+') {
          event.preventDefault();
          zoomAtCanvasCenter(1.2);
        } else if (event.key === '-') {
          event.preventDefault();
          zoomAtCanvasCenter(1 / 1.2);
        } else if (event.key === '0') {
          event.preventDefault();
          state.resetView();
          const canvas = canvasRef.current;
          if (canvas) {
            if (presentation) {
              presentation.setViewport(canvas.getBoundingClientRect(), {
                zoom: 1,
                viewX: 0,
                viewY: 0,
              });
            } else {
              postRendererViewport(workerRef.current, canvas.getBoundingClientRect(), {
                zoom: 1,
                viewX: 0,
                viewY: 0,
              });
            }
          }
        }
        return;
      }

      const tool = getCanvasToolShortcut(event.key);
      if (tool) state.setTool(tool);
      if (event.code === 'Space') {
        event.preventDefault();
        onSpacePanStart();
      }
      if (event.key === '?' || (event.shiftKey && event.key === '/')) {
        event.preventDefault();
        setShowShortcuts(true);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Shift') {
        setIsShiftPressed(false);
      } else if (event.code === 'Space') {
        onSpacePanEnd();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [
    canvasRef,
    onSpacePanEnd,
    onSpacePanStart,
    presentation,
    setIsShiftPressed,
    setShowShortcuts,
    workerRef,
  ]);
}
