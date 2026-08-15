import { expect, test } from '@playwright/test';

import {
  createLargeBoardObjects,
  LARGE_BOARD_FIXTURE_CHECKSUM,
  LARGE_BOARD_FIXTURE_VERSION,
  LARGE_BOARD_OBJECT_COUNT,
} from '../../test/largeBoardFixture';

declare global {
  interface Window {
    __SKETCHFLOW_FRAME_SAMPLES__?: number[];
    __SKETCHFLOW_FRAME_SAMPLING__?: boolean;
  }
}

const boardObjects = createLargeBoardObjects();

// Route interception must see the benchmark fixture request rather than an E2E
// service worker fetch. PWA behavior is exercised in its dedicated specs.
test.use({ trace: 'on', serviceWorkers: 'block' });

test('10,000-object board remains interactive without uncaught errors', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/projects/shared/benchmark-token', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'benchmark-project',
        title: '10,000 object benchmark',
        revision: 1,
        data: { objects: boardObjects },
        role: 'editor',
        shared: true,
      }),
    });
  });

  const projectResponse = page.waitForResponse((response) =>
    response.url().includes('/api/projects/shared/benchmark-token'),
  );
  const navigationStarted = Date.now();
  await page.goto('/draw?share=benchmark-token');
  const responseData: {
    data?: { objects?: unknown[] };
  } = await (await projectResponse).json();
  await expect
    .poll(async () => (await responseData).data?.objects?.length)
    .toBe(LARGE_BOARD_OBJECT_COUNT);
  const canvas = page.locator('canvas').first();
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute('data-object-count', String(LARGE_BOARD_OBJECT_COUNT));
  await page.waitForFunction((expectedCount) => {
    return window.__SKETCHFLOW_RENDERER_EVENTS__?.some(
      (event) => event.type === 'frame-rendered' && event.retainedObjectCount === expectedCount,
    );
  }, LARGE_BOARD_OBJECT_COUNT);
  const initialLoadMs = Date.now() - navigationStarted;

  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas did not render');
  await page.evaluate(() => {
    window.__SKETCHFLOW_FRAME_SAMPLES__ = [];
    window.__SKETCHFLOW_FRAME_SAMPLING__ = true;
    let previous = performance.now();
    const sample = (timestamp: number) => {
      if (!window.__SKETCHFLOW_FRAME_SAMPLING__) return;
      window.__SKETCHFLOW_FRAME_SAMPLES__?.push(timestamp - previous);
      previous = timestamp;
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  const panStarted = performance.now();
  await page.keyboard.down(' ');
  await page.mouse.move(box.x + 400, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 240, box.y + 220, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up(' ');
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -240);
  await page.keyboard.up('Control');
  await page.waitForTimeout(100);
  const panZoomMs = performance.now() - panStarted;
  const frameIntervals = await page.evaluate(() => {
    window.__SKETCHFLOW_FRAME_SAMPLING__ = false;
    return window.__SKETCHFLOW_FRAME_SAMPLES__ ?? [];
  });

  const clientMetrics = await page.evaluate(() => {
    const memory = performance;
    const canvas = document.querySelector('canvas');
    const rect = canvas?.getBoundingClientRect();
    const rendererEvents = window.__SKETCHFLOW_RENDERER_EVENTS__ ?? [];
    const sceneApplied = rendererEvents.find((event) => event.type === 'scene-applied');
    const latestFrame = [...rendererEvents]
      .reverse()
      .find((event) => event.type === 'frame-rendered');
    return {
      heapUsedBytes: memory.memory?.usedJSHeapSize ?? null,
      canvasWidth: rect?.width ?? 0,
      canvasHeight: rect?.height ?? 0,
      renderer: {
        sceneIngestionMs: sceneApplied?.ingestionMs ?? null,
        retainedObjectCount: latestFrame?.retainedObjectCount ?? null,
        visibleObjectCount: latestFrame?.visibleObjectCount ?? null,
        culledObjectCount: latestFrame?.culledObjectCount ?? null,
        renderMs: latestFrame?.renderMs ?? null,
      },
    };
  });
  await testInfo.attach('large-board-benchmark.json', {
    contentType: 'application/json',
    body: JSON.stringify(
      {
        schemaVersion: 1,
        fixture: {
          version: LARGE_BOARD_FIXTURE_VERSION,
          checksum: LARGE_BOARD_FIXTURE_CHECKSUM,
        },
        objectCount: boardObjects.length,
        initialLoadMs,
        panZoomMs,
        averageFrameMs:
          frameIntervals.length > 0
            ? frameIntervals.reduce((total, value) => total + value, 0) / frameIntervals.length
            : null,
        maxFrameMs: frameIntervals.length > 0 ? Math.max(...frameIntervals) : null,
        ...clientMetrics,
        uncaughtErrors: errors,
      },
      null,
      2,
    ),
  });

  expect(errors).toEqual([]);
  expect(panZoomMs).toBeLessThan(1_000);
});
