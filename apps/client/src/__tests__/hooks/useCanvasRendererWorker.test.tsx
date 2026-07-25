import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCanvasRendererWorker } from '@/hooks/useCanvasRendererWorker';

class MockWorker {
  public postMessage = vi.fn();
  public terminate = vi.fn();
  private listeners = new Map<string, Set<(event: Event) => void>>();

  public addEventListener(type: string, listener: (event: Event) => void) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  public removeEventListener(type: string, listener: (event: Event) => void) {
    this.listeners.get(type)?.delete(listener);
  }

  public emit(type: string, data?: unknown) {
    const event = type === 'message' ? new MessageEvent(type, { data }) : new Event(type);
    this.listeners.get(type)?.forEach((listener) => listener(event));
  }
}

describe('useCanvasRendererWorker', () => {
  let worker: MockWorker;
  let constructor: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    worker = new MockWorker();
    constructor = vi.fn(
      class {
        public constructor() {
          return worker;
        }
      },
    );
    vi.stubGlobal('Worker', constructor);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('owns one worker, follows readiness, and releases it on unmount', () => {
    const canvas = {
      transferControlToOffscreen: vi.fn(() => ({}) as OffscreenCanvas),
      getBoundingClientRect: () => ({ width: 100, height: 50 }),
    } as unknown as HTMLCanvasElement;
    const canvasRef = { current: canvas };
    const workerRef = { current: null as Worker | null };

    const { result, rerender, unmount } = renderHook(
      ({ zoom, viewX, viewY }) =>
        useCanvasRendererWorker(canvasRef, workerRef, { zoom, viewX, viewY }, 'dark'),
      { initialProps: { zoom: 1, viewX: 0, viewY: 0 } },
    );

    expect(constructor).toHaveBeenCalledOnce();
    expect(canvas.transferControlToOffscreen).toHaveBeenCalledOnce();
    expect(worker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'init' }),
      expect.any(Array),
    );

    act(() => worker.emit('message', { type: 'ready' }));
    expect(result.current).toBe('ready');

    rerender({ zoom: 2, viewX: 10, viewY: 20 });
    expect(constructor).toHaveBeenCalledOnce();
    expect(worker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'viewport', zoom: 2, viewX: 10, viewY: 20 }),
    );

    unmount();
    act(() => vi.runAllTimers());
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(workerRef.current).toBeNull();
  });

  it('fails safely when the worker reports initialization failure', () => {
    const canvas = {
      transferControlToOffscreen: vi.fn(() => ({}) as OffscreenCanvas),
      getBoundingClientRect: () => ({ width: 100, height: 50 }),
    } as unknown as HTMLCanvasElement;
    const canvasRef = { current: canvas };
    const workerRef = { current: null as Worker | null };
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() =>
      useCanvasRendererWorker(canvasRef, workerRef, { zoom: 1, viewX: 0, viewY: 0 }, 'light'),
    );

    act(() => worker.emit('message', { type: 'init-error', reason: 'No 2D context' }));

    expect(result.current).toBe('failed');
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(workerRef.current).toBeNull();
    error.mockRestore();
  });

  it('fails safely when the worker emits an error', () => {
    const canvas = {
      transferControlToOffscreen: vi.fn(() => ({}) as OffscreenCanvas),
      getBoundingClientRect: () => ({ width: 100, height: 50 }),
    } as unknown as HTMLCanvasElement;
    const canvasRef = { current: canvas };
    const workerRef = { current: null as Worker | null };
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() =>
      useCanvasRendererWorker(canvasRef, workerRef, { zoom: 1, viewX: 0, viewY: 0 }, 'light'),
    );

    act(() => worker.emit('error'));

    expect(result.current).toBe('failed');
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(workerRef.current).toBeNull();
    error.mockRestore();
  });

  it('fails safely when the worker emits a message error', () => {
    const canvas = {
      transferControlToOffscreen: vi.fn(() => ({}) as OffscreenCanvas),
      getBoundingClientRect: () => ({ width: 100, height: 50 }),
    } as unknown as HTMLCanvasElement;
    const canvasRef = { current: canvas };
    const workerRef = { current: null as Worker | null };
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() =>
      useCanvasRendererWorker(canvasRef, workerRef, { zoom: 1, viewX: 0, viewY: 0 }, 'light'),
    );

    act(() => worker.emit('messageerror'));

    expect(result.current).toBe('failed');
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(workerRef.current).toBeNull();
    error.mockRestore();
  });

  it('uses the main-thread fallback when transferable OffscreenCanvas is unavailable', () => {
    const canvas = {
      getBoundingClientRect: () => ({ width: 100, height: 50 }),
    } as unknown as HTMLCanvasElement;
    const canvasRef = { current: canvas };
    const workerRef = { current: null as Worker | null };
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() =>
      useCanvasRendererWorker(canvasRef, workerRef, { zoom: 1, viewX: 0, viewY: 0 }, 'light'),
    );

    expect(result.current).toBe('fallback');
    expect(constructor).not.toHaveBeenCalled();
    error.mockRestore();
  });
});
