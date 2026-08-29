import { expect, test } from '@playwright/test';

test('guest canvas supports drawing, undo/redo, rectangles, and custom triangles without runtime errors', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');
  await page.getByRole('button', { name: 'Start Drawing' }).click();
  const skip = page.getByRole('button', { name: 'Skip tutorial' });
  await skip.waitFor();
  await skip.click();

  const canvas = page.locator('canvas').first();
  await expect(canvas).toHaveAttribute('data-object-count', '0');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas did not render');

  const initial = await canvas.screenshot();
  await page.mouse.move(box.x + 160, box.y + 160);
  await page.mouse.down();
  await page.mouse.move(box.x + 340, box.y + 250, { steps: 10 });
  await page.mouse.up();
  await expect(canvas).toHaveAttribute('data-object-count', '1');
  await expect.poll(async () => !(await canvas.screenshot()).equals(initial)).toBeTruthy();
  const stroke = await canvas.screenshot();

  await page.keyboard.press('Control+z');
  await expect(canvas).toHaveAttribute('data-object-count', '0');
  await page.keyboard.press('Control+y');
  await expect(canvas).toHaveAttribute('data-object-count', '1');

  await page.keyboard.press('r');
  await page.mouse.move(box.x + 420, box.y + 160);
  await page.mouse.down();
  await page.mouse.move(box.x + 560, box.y + 270, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => !(await canvas.screenshot()).equals(stroke)).toBeTruthy();

  const rectangle = await canvas.screenshot();
  await page.getByRole('button', { name: 'Triangle', exact: true }).click();
  await page.mouse.click(box.x + 180, box.y + 360);
  await page.mouse.click(box.x + 360, box.y + 430);
  await page.mouse.click(box.x + 240, box.y + 520);
  await expect.poll(async () => !(await canvas.screenshot()).equals(rectangle)).toBeTruthy();
  expect(errors).toEqual([]);
});
