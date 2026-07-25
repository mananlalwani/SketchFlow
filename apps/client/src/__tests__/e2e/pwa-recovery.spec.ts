import { expect, test } from '@playwright/test';

test('the app shell recovers offline without caching authenticated API responses', async ({
  context,
  page,
}) => {
  test.setTimeout(60_000);
  await page.route('**/api/authenticated-cache-test', async (route) => {
    await route.fulfill({ status: 401, contentType: 'application/json', body: '{}' });
  });
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });

  const updateState = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    await registration.update();
    return Boolean(registration.active);
  });
  expect(updateState).toBe(true);

  const onlineApiResponse = await page.evaluate(async () => {
    const response = await fetch('/api/authenticated-cache-test', { credentials: 'include' });
    return {
      status: response.status,
      fromServiceWorker: Boolean(navigator.serviceWorker.controller),
    };
  });
  expect(onlineApiResponse.status).toBe(401);
  expect(onlineApiResponse.fromServiceWorker).toBe(true);

  const cachedAuthenticatedApi = await page.evaluate(async () => {
    const caches = await window.caches.keys();
    const entries = await Promise.all(
      caches.map(async (name) => {
        const cache = await window.caches.open(name);
        return cache.keys();
      }),
    );
    return entries.flat().some((request) => request.url.includes('/api/authenticated-cache-test'));
  });
  expect(cachedAuthenticatedApi).toBe(false);

  await page.unroute('**/api/authenticated-cache-test');
  await context.setOffline(true);
  await page.goto('/', { waitUntil: 'networkidle', timeout: 15_000 }).catch(() => {});
  await expect(page.getByRole('button', { name: 'Start Drawing' })).toBeVisible({
    timeout: 15_000,
  });

  const offlineApiResult = await page.evaluate(async () => {
    try {
      await fetch('/api/authenticated-cache-test', { credentials: 'include' });
      return 'resolved';
    } catch {
      return 'rejected';
    }
  });
  expect(offlineApiResult).toBe('rejected');
});
