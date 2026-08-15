import { expect, test } from '@playwright/test';

type Vitals = { cls: number; inp: number; lcp: number };

declare global {
  interface Window {
    __phase5Vitals?: Vitals;
  }

  interface PerformanceObserverInit {
    durationThreshold?: number;
  }

  interface PerformanceEntry {
    hadRecentInput?: boolean;
    interactionId?: number;
    value?: number;
  }
}

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
    const vitals: Vitals = { cls: 0, inp: 0, lcp: 0 };
    window.__phase5Vitals = vitals;

    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) vitals.lcp = entry.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });

    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const value = entry.value ?? 0;
        if (entry.hadRecentInput === false && Number.isFinite(value)) vitals.cls += value;
      }
    }).observe({ type: 'layout-shift', buffered: true });

    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const interactionId = entry.interactionId ?? 0;
        if (Number.isFinite(interactionId) && interactionId) {
          vitals.inp = Math.max(vitals.inp, entry.duration);
        }
      }
    }).observe({ type: 'event', buffered: true, durationThreshold: 16 });
  });

  await page.goto('/');
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Start Drawing' }).click();
  await page.waitForTimeout(500);

  const vitals = await page.evaluate(() => window.__phase5Vitals);
  await testInfo.attach('web-vitals-mobile.json', {
    contentType: 'application/json',
    body: JSON.stringify(vitals, null, 2),
  });

  if (!vitals) throw new Error('Performance vitals were not initialized');
  expect(vitals.lcp).toBeGreaterThan(0);
  expect(vitals.lcp).toBeLessThanOrEqual(2_500);
  expect(vitals.inp).toBeLessThanOrEqual(200);
  expect(vitals.cls).toBeLessThanOrEqual(0.1);
});
