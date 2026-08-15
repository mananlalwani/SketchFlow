import { fireEvent, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useCanvasKeyboardShortcuts,
  type RendererWorkerPort,
} from '@/hooks/useCanvasKeyboardShortcuts';
import { useDrawingStore } from '@/store/drawingStore';

describe('useCanvasKeyboardShortcuts', () => {
  let canvas: HTMLCanvasElement;
  const worker: RendererWorkerPort = { postMessage: vi.fn() };
  const setIsShiftPressed = vi.fn();
  const onSpacePanStart = vi.fn();
  const onSpacePanEnd = vi.fn();
  const setShowShortcuts = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 1000, 600));
    useDrawingStore.setState({
      currentTool: 'pen',
      zoom: 1,
      viewX: 100,
      viewY: 200,
    });
  });

  function renderShortcuts() {
    return renderHook(() =>
      useCanvasKeyboardShortcuts({
        canvasRef: { current: canvas },
        workerRef: { current: worker },
        setIsShiftPressed,
        onSpacePanStart,
        onSpacePanEnd,
        setShowShortcuts,
      }),
    );
  }

  it('selects tools and manages transient keyboard input', () => {
    renderShortcuts();

    fireEvent.keyDown(window, { key: 'r' });
    fireEvent.keyDown(window, { key: 'Shift' });
    fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    fireEvent.keyUp(window, { key: ' ', code: 'Space' });
    fireEvent.keyUp(window, { key: 'Shift' });
    fireEvent.keyDown(window, { key: '?', shiftKey: true });

    expect(useDrawingStore.getState().currentTool).toBe('rectangle');
    expect(setIsShiftPressed).toHaveBeenNthCalledWith(1, true);
    expect(setIsShiftPressed).toHaveBeenLastCalledWith(false);
    expect(onSpacePanStart).toHaveBeenCalledOnce();
    expect(onSpacePanEnd).toHaveBeenCalledOnce();
    expect(setShowShortcuts).toHaveBeenCalledWith(true);
  });

  it('zooms at the canvas center and synchronizes the worker', () => {
    renderShortcuts();

    fireEvent.keyDown(window, { key: '+', ctrlKey: true });

    expect(useDrawingStore.getState().zoom).toBe(1.2);
    expect(worker.postMessage).toHaveBeenCalledWith({
      type: 'viewport',
      zoom: 1.2,
      viewX: 183.33333333333331,
      viewY: 250,
      canvasWidth: 1000,
      canvasHeight: 600,
      dpr: 1,
    });
  });
});
