import { useState, useCallback } from 'react';

declare global {
  interface Performance {
    memory?: { usedJSHeapSize: number };
  }
}

interface PerformanceMetrics {
  fps: number;
  frameTime: number;
  memoryUsage: number;
  cpuLoad: number;
  adaptiveQuality: 'high' | 'medium' | 'low';
}

export const usePerformanceMonitor = () => {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    fps: 60, // Start with optimistic value
    frameTime: 16.67,
    memoryUsage: 0,
    cpuLoad: 0,
    adaptiveQuality: 'high',
  });

  const [, setFrameCount] = useState<number>(0);
  const [lastTime, setLastTime] = useState<number>(performance.now());

  const updateMetrics = useCallback(
    (frameStartTime: number, frameEndTime: number) => {
      const frameTime = frameEndTime - frameStartTime;
      const now = performance.now();

      setFrameCount((prev) => {
        const newCount = prev + 1;

        // Update metrics every second
        if (now - lastTime >= 1000) {
          const currentFps = Math.round((newCount * 1000) / (now - lastTime));

          // Estimate CPU load based on frame time
          const targetFrameTime = 16.67; // 60fps = ~16.67ms per frame
          const cpuLoad = Math.min(100, (frameTime / targetFrameTime) * 100);

          // Get memory usage if available
          let memoryUsage = 0;
          if (performance.memory) {
            memoryUsage = Math.round(performance.memory.usedJSHeapSize / (1024 * 1024)); // MB
          }

          // Adaptive quality based on performance
          let adaptiveQuality: 'high' | 'medium' | 'low' = 'high';
          if (currentFps < 30 || cpuLoad > 80) {
            adaptiveQuality = 'low';
          } else if (currentFps < 45 || cpuLoad > 60) {
            adaptiveQuality = 'medium';
          }

          setMetrics({
            fps: currentFps,
            frameTime,
            memoryUsage,
            cpuLoad,
            adaptiveQuality,
          });

          setLastTime(now);
          return 0; // Reset frame count
        }

        return newCount;
      });
    },
    [lastTime],
  );

  // Throttle function that adapts based on performance
  const getAdaptiveThrottleMs = useCallback(() => {
    switch (metrics.adaptiveQuality) {
      case 'low':
        return 100; // Slower updates for low performance
      case 'medium':
        return 50;
      case 'high':
        return 16; // ~60fps
      default:
        return 16;
    }
  }, [metrics.adaptiveQuality]);

  // Get canvas quality settings based on performance
  const getCanvasSettings = useCallback(() => {
    switch (metrics.adaptiveQuality) {
      case 'low':
        return {
          imageSmoothingEnabled: false,
          shadowBlur: 0,
          lineWidth: Math.max(1, Math.floor(metrics.fps / 15)), // Adjust line quality
        };
      case 'medium':
        return {
          imageSmoothingEnabled: true,
          shadowBlur: 1,
          lineWidth: 1,
        };
      case 'high':
      default:
        return {
          imageSmoothingEnabled: true,
          shadowBlur: 2,
          lineWidth: 1,
        };
    }
  }, [metrics.adaptiveQuality, metrics.fps]);

  return {
    metrics,
    updateMetrics,
    getAdaptiveThrottleMs,
    getCanvasSettings,
    shouldSkipFrame: metrics.fps < 15, // Skip frames if performance is very poor
  };
};
