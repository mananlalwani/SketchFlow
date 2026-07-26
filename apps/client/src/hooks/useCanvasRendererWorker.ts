import { useEffect, useRef, useState, type MutableRefObject, type RefObject } from 'react';
import { postRendererViewport } from '@/lib/canvasRendererViewport';
import { isRendererWorkerEvent } from '@/lib/rendererWorkerProtocol';
import { WORLD_HEIGHT, WORLD_WIDTH } from '@/lib/canvasViewport';

interface RendererViewport {
  zoom: number;
  viewX: number;
  viewY: number;
}

export type RendererWorkerStatus = 'fallback' | 'starting' | 'ready' | 'failed';

/**
 * Owns the OffscreenCanvas renderer lifecycle. Unsupported browsers use a
 * main-thread retained-mode fallback instead of being blocked from editing.
 */
export function useCanvasRendererWorker(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  workerRef: MutableRefObject<Worker | null>,
  viewport: RendererViewport,
  theme: string,
): RendererWorkerStatus {
  const [status, setStatus] = useState<RendererWorkerStatus>('starting');
  const viewportRef = useRef(viewport);
  const themeRef = useRef(theme);
  const disposeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disposeRef = useRef<(() => void) | null>(null);

  viewportRef.current = viewport;
  themeRef.current = theme;

  const sendViewport = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    postRendererViewport(workerRef.current, canvas.getBoundingClientRect(), viewportRef.current);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (disposeTimerRef.current) {
      clearTimeout(disposeTimerRef.current);
      disposeTimerRef.current = null;
    }

    const scheduleDispose = () => {
      // React Strict Mode immediately re-runs effects in development. Deferring
      // disposal preserves the one irreversible canvas transfer in that cycle,
      // while a real unmount still releases the worker and its graphics realm.
      disposeTimerRef.current = setTimeout(() => {
        disposeTimerRef.current = null;
        disposeRef.current?.();
      }, 0);
    };

    if (workerRef.current) return scheduleDispose;

    if (!('transferControlToOffscreen' in canvas)) {
      console.error('OffscreenCanvas rendering is not supported by this browser.');
      setStatus('fallback');
      return;
    }

    let worker: Worker | null = null;
    let disposed = false;

    const dispose = () => {
      if (disposed) return;
      disposed = true;
      if (!worker) return;
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onFailure);
      worker.removeEventListener('messageerror', onFailure);
      worker.terminate();
      if (workerRef.current === worker) workerRef.current = null;
      if (disposeRef.current === dispose) disposeRef.current = null;
    };
    disposeRef.current = dispose;

    const onFailure = (event: Event) => {
      if (disposed) return;
      console.error('Canvas renderer worker failed:', event);
      setStatus('failed');
      dispose();
    };

    const onMessage = (event: MessageEvent<unknown>) => {
      if (!isRendererWorkerEvent(event.data)) return;
      if (event.data.type === 'ready') {
        setStatus('ready');
        sendViewport();
        worker?.postMessage({
          type: 'theme',
          bgColor: themeRef.current === 'dark' ? '#0a0a0a' : '#e0e0e0',
        });
      } else if (event.data.type === 'init-error') {
        console.error(`Canvas renderer worker initialization failed: ${event.data.reason}`);
        setStatus('failed');
        dispose();
      }
      if (!import.meta.env.VITE_E2E) return;
      const benchmarkWindow = window as Window & {
        __SKETCHFLOW_RENDERER_EVENTS__?: unknown[];
      };
      benchmarkWindow.__SKETCHFLOW_RENDERER_EVENTS__ ??= [];
      benchmarkWindow.__SKETCHFLOW_RENDERER_EVENTS__.push(event.data);
    };

    try {
      worker = new Worker(new URL('../workers/rendererWorker.ts', import.meta.url), {
        type: 'module',
      });
      worker.addEventListener('message', onMessage);
      worker.addEventListener('error', onFailure);
      worker.addEventListener('messageerror', onFailure);

      const offscreen = canvas.transferControlToOffscreen();
      worker.postMessage(
        { type: 'init', canvas: offscreen, worldWidth: WORLD_WIDTH, worldHeight: WORLD_HEIGHT },
        [offscreen],
      );
      workerRef.current = worker;
      setStatus('starting');
    } catch (error) {
      console.error('Canvas renderer worker initialization failed:', error);
      setStatus('failed');
      dispose();
    }

    return scheduleDispose;
    // sendViewport intentionally reads current refs; depending on it would recreate the worker lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasRef, workerRef]);

  useEffect(() => {
    sendViewport();
    // sendViewport reads the latest viewport ref and must not restart worker setup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewport.zoom, viewport.viewX, viewport.viewY]);

  useEffect(() => {
    const resendWhenVisible = () => {
      if (!document.hidden) sendViewport();
    };
    window.addEventListener('resize', sendViewport);
    document.addEventListener('visibilitychange', resendWhenVisible);
    window.addEventListener('focus', sendViewport);
    return () => {
      window.removeEventListener('resize', sendViewport);
      document.removeEventListener('visibilitychange', resendWhenVisible);
      window.removeEventListener('focus', sendViewport);
    };
    // sendViewport intentionally reads current refs; depending on it would recreate the worker lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasRef, workerRef]);

  useEffect(() => {
    workerRef.current?.postMessage({
      type: 'theme',
      bgColor: theme === 'dark' ? '#0a0a0a' : '#e0e0e0',
    });
  }, [theme, workerRef]);

  return status;
}
