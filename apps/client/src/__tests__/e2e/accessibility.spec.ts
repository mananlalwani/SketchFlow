import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

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
