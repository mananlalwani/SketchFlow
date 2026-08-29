import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const e2eProject = {
  id: 'e2e-project',
  userId: 'e2e-user',
  title: 'Accessibility project',
  createdAt: 0,
  updatedAt: 0,
  role: 'owner',
  shared: false,
};

test('draw workspace has no serious accessibility violations', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start Drawing' }).click();
  await page.getByRole('button', { name: 'Skip tutorial' }).click();

  const results = await new AxeBuilder({ page })
    .exclude('canvas')
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();

  expect(
    results.violations.filter((violation) =>
      ['critical', 'serious'].includes(violation.impact ?? ''),
    ),
  ).toEqual([]);
});

test('project manager and settings dialog have no serious accessibility violations', async ({
  page,
}) => {
  await page.goto('/draw');
  await page.waitForTimeout(350);

  const projectManager = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(
    projectManager.violations.filter((violation) =>
      ['critical', 'serious'].includes(violation.impact ?? ''),
    ),
  ).toEqual([]);

  await page.getByRole('button', { name: 'Start Drawing' }).click();
  await page.getByRole('button', { name: 'Skip tutorial' }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('menuitem', { name: 'About' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.evaluate(async (element) => {
    await Promise.all(
      element.getAnimations({ subtree: true }).map((animation) => animation.finished),
    );
  });
  const dialogResults = await new AxeBuilder({ page })
    .include('[role="dialog"]')
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  expect(
    dialogResults.violations.filter((violation) =>
      ['critical', 'serious'].includes(violation.impact ?? ''),
    ),
  ).toEqual([]);
});

test('share dialog has no serious accessibility violations', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('e2e-authenticated', 'true');
  });
  await page.route('**/api/**', async (route) => {
    const { pathname } = new URL(route.request().url());
    const body =
      pathname === '/api/projects'
        ? [e2eProject]
        : pathname === `/api/projects/${e2eProject.id}`
          ? { ...e2eProject, data: { objects: [] } }
          : pathname === `/api/projects/${e2eProject.id}/collaborators`
            ? []
            : undefined;

    if (body === undefined) {
      await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
      return;
    }

    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });

  await page.goto('/draw');
  await page.getByRole('button', { name: 'Actions for Accessibility project' }).click();
  await page.getByRole('menuitem', { name: 'Share' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const results = await new AxeBuilder({ page })
    .include('[role="dialog"]')
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  expect(
    results.violations.filter((violation) =>
      ['critical', 'serious'].includes(violation.impact ?? ''),
    ),
  ).toEqual([]);
});
