import { expect, test } from '@playwright/test';

test('a changed service worker activates and takes control', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });

  const changedController = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    const controllerChanged = new Promise<void>((resolve) => {
      navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true });
    });
    await registration.update();
    await controllerChanged;
    return Boolean(navigator.serviceWorker.controller);
  });

  expect(changedController).toBe(true);
});
