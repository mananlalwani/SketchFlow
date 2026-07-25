import { expect, test } from '@playwright/test';

test.use({
  viewport: { width: 393, height: 851 },
  deviceScaleFactor: 2.75,
  isMobile: true,
  hasTouch: true,
});

test('mobile reference profile meets Core Web Vitals budgets', async ({ page }, testInfo) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.addInitScript(() => {
    const vitals = { cls: 0, inp: 0, lcp: 0 };
    (window as unknown as { __phase5Vitals: typeof vitals }).__phase5Vitals = vitals;

    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) vitals.lcp = entry.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });

    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as PerformanceEntry[]) {
        const shift = entry as PerformanceEntry & { hadRecentInput?: boolean; value?: number };
        if (!shift.hadRecentInput) vitals.cls += shift.value ?? 0;
      }
    }).observe({ type: 'layout-shift', buffered: true });

    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as PerformanceEntry[]) {
        const event = entry as PerformanceEntry & { duration?: number; interactionId?: number };
        if (event.interactionId) vitals.inp = Math.max(vitals.inp, event.duration ?? 0);
      }
    }).observe({ type: 'event', buffered: true, durationThreshold: 16 } as PerformanceObserverInit);
  });

  await page.goto('/');
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Start Drawing' }).click();
  await page.waitForTimeout(500);

  const vitals = await page.evaluate(
    () =>
      (window as unknown as { __phase5Vitals: { cls: number; inp: number; lcp: number } })
        .__phase5Vitals,
  );
  await testInfo.attach('web-vitals-mobile.json', {
    contentType: 'application/json',
    body: JSON.stringify(vitals, null, 2),
  });

  expect(vitals.lcp).toBeGreaterThan(0);
  expect(vitals.lcp).toBeLessThanOrEqual(2_500);
  expect(vitals.inp).toBeLessThanOrEqual(200);
  expect(vitals.cls).toBeLessThanOrEqual(0.1);
});
