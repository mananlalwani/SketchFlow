import { renderHook } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCanvasRendererFallback } from '@/hooks/useCanvasRendererFallback';

describe('useCanvasRendererFallback', () => {
  const context = {
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    strokeRect: vi.fn(),
    ellipse: vi.fn(),
    arc: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    fillText: vi.fn(),
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  const canvas = document.createElement('canvas');

  beforeAll(() => {
    if (!globalThis.ResizeObserver) {
      Object.defineProperty(globalThis, 'ResizeObserver', {
        configurable: true,
        value: class {
          observe() {}
          disconnect() {}
        },
      });
    }
  });

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(canvas, 'getContext', { value: () => context, configurable: true });
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 400, 300));
  });

  it('renders ordered visible objects and skips hidden objects', () => {
    renderHook(() =>
      useCanvasRendererFallback(
        { current: canvas },
        true,
        [
          {
            id: 'hidden',
            type: 'rectangle',
            x: 0,
            y: 0,
            width: 10,
            height: 10,
            color: '#000',
            size: 1,
            hidden: true,
          },
          {
            id: 'circle',
            type: 'circle',
            x: 10,
            y: 20,
            width: 80,
            height: 40,
            color: '#000',
            size: 2,
          },
          {
            id: 'triangle',
            type: 'triangle',
            x: 20,
            y: 30,
            width: 50,
            height: 50,
            color: '#000',
            size: 2,
          },
        ],
        { zoom: 1, viewX: 0, viewY: 0 },
        '#fff',
      ),
    );
    expect(context.arc).toHaveBeenCalledWith(50, 40, 20, 0, Math.PI * 2);
    expect(context.moveTo).toHaveBeenCalled();
    expect(context.stroke).toHaveBeenCalled();
  });

  it('loads and draws images through the fallback lifecycle', async () => {
    class MockImage {
      onload: (() => void) | null = null;
      complete = true;
      naturalWidth = 10;
      set src(_: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal('Image', MockImage);
    renderHook(() =>
      useCanvasRendererFallback(
        { current: canvas },
        true,
        [
          {
            id: 'image',
            type: 'image',
            x: 4,
            y: 5,
            width: 20,
            height: 30,
            color: '#000',
            size: 1,
            imageData: 'data:image/png;base64,test',
          },
        ],
        { zoom: 1, viewX: 0, viewY: 0 },
        '#fff',
      ),
    );
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    expect(context.drawImage).toHaveBeenCalled();
  });
});
