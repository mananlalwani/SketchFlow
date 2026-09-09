import { expect, test, type Locator, type Page } from '@playwright/test';

type PointerKind = 'mouse' | 'pen' | 'touch';
type PointerPhase = 'down' | 'move' | 'up' | 'cancel' | 'lostpointercapture';

async function openGuestCanvas(page: Page, viewport?: { width: number; height: number }) {
  if (viewport) await page.setViewportSize(viewport);
  await page.goto('/');
  await page.getByRole('button', { name: 'Start a note', exact: true }).click();
  const skipTutorial = page.getByRole('button', { name: 'Skip tutorial' });
  if (await skipTutorial.isVisible().catch(() => false)) await skipTutorial.click();

  const canvas = page.locator('canvas').first();
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute('data-object-count', '0');
  return canvas;
}

async function pointerEvent(
  canvas: Locator,
  phase: PointerPhase,
  input: {
    pointerId: number;
    pointerType: PointerKind;
    x: number;
    y: number;
    isPrimary?: boolean;
  },
) {
  await canvas.evaluate(
    (element, { phase, input }) => {
      const eventType = phase === 'lostpointercapture' ? phase : `pointer${phase}`;
      const event = new PointerEvent(eventType, {
        bubbles: true,
        cancelable: true,
        pointerId: input.pointerId,
        pointerType: input.pointerType,
        isPrimary: input.isPrimary ?? true,
        clientX: input.x,
        clientY: input.y,
        button: phase === 'down' || phase === 'up' ? 0 : -1,
        buttons: phase === 'up' || phase === 'cancel' || phase === 'lostpointercapture' ? 0 : 1,
        pressure: phase === 'up' || phase === 'cancel' || phase === 'lostpointercapture' ? 0 : 0.5,
      });
      element.dispatchEvent(event);
    },
    { phase, input },
  );
}

async function drawStroke(
  canvas: Locator,
  pointerType: PointerKind,
  pointerId = 1,
  offset = { x: 180, y: 170 },
) {
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas did not render');

  const start = { x: box.x + offset.x, y: box.y + offset.y };
  const end = { x: start.x + 180, y: start.y + 100 };
  await pointerEvent(canvas, 'down', { pointerId, pointerType, ...start });
  await pointerEvent(canvas, 'move', { pointerId, pointerType, x: start.x + 60, y: start.y + 30 });
  await pointerEvent(canvas, 'move', { pointerId, pointerType, ...end });
  await pointerEvent(canvas, 'up', { pointerId, pointerType, ...end });
}

async function dragTouch(canvas: Locator, pointerId = 1, offset = { x: 180, y: 170 }) {
  await drawStroke(canvas, 'touch', pointerId, offset);
}

async function selectDrawingInput(page: Page, value: 'auto' | 'stylus-only' | 'stylus-and-touch') {
  await page.locator('select').first().selectOption(value);
}

test('auto input lets an initial finger stroke create one object', async ({ page }) => {
  const canvas = await openGuestCanvas(page);

  await dragTouch(canvas);

  await expect(canvas).toHaveAttribute('data-object-count', '1');
});

test('after pen detection, one-finger touch pans without creating content', async ({ page }) => {
  const canvas = await openGuestCanvas(page);
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas did not render');

  // A pen contact establishes the automatic stylus preference, then ends cleanly.
  await pointerEvent(canvas, 'down', {
    pointerId: 10,
    pointerType: 'pen',
    x: box.x + 220,
    y: box.y + 180,
  });
  await pointerEvent(canvas, 'up', {
    pointerId: 10,
    pointerType: 'pen',
    x: box.x + 220,
    y: box.y + 180,
  });

  await pointerEvent(canvas, 'down', {
    pointerId: 11,
    pointerType: 'touch',
    x: box.x + 220,
    y: box.y + 180,
  });
  await pointerEvent(canvas, 'move', {
    pointerId: 11,
    pointerType: 'touch',
    x: box.x + 360,
    y: box.y + 250,
  });
  await pointerEvent(canvas, 'up', {
    pointerId: 11,
    pointerType: 'touch',
    x: box.x + 360,
    y: box.y + 250,
  });

  await expect(canvas).toHaveAttribute('data-object-count', '0');
});

test('stylus-only blocks touch drawing', async ({ page }) => {
  const canvas = await openGuestCanvas(page);

  await selectDrawingInput(page, 'stylus-only');
  await dragTouch(canvas);
  await expect(canvas).toHaveAttribute('data-object-count', '0');
});

test('stylus-and-touch permits touch drawing', async ({ page }) => {
  const canvas = await openGuestCanvas(page);

  await selectDrawingInput(page, 'stylus-and-touch');
  await dragTouch(canvas, 1, { x: 260, y: 250 });
  await expect(canvas).toHaveAttribute('data-object-count', '1');
});

test('an active pen remains the only drawing contact when touch is present', async ({ page }) => {
  const canvas = await openGuestCanvas(page);
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas did not render');

  const penStart = { x: box.x + 180, y: box.y + 170 };
  await pointerEvent(canvas, 'down', {
    pointerId: 1,
    pointerType: 'pen',
    ...penStart,
  });
  await pointerEvent(canvas, 'move', {
    pointerId: 1,
    pointerType: 'pen',
    x: penStart.x + 70,
    y: penStart.y + 30,
  });

  // The touch contact is simultaneous with the pen and must not become a second stroke.
  await pointerEvent(canvas, 'down', {
    pointerId: 2,
    pointerType: 'touch',
    x: box.x + 500,
    y: box.y + 300,
    isPrimary: false,
  });
  await pointerEvent(canvas, 'up', {
    pointerId: 2,
    pointerType: 'touch',
    x: box.x + 620,
    y: box.y + 340,
  });

  await pointerEvent(canvas, 'move', {
    pointerId: 1,
    pointerType: 'pen',
    x: penStart.x + 200,
    y: penStart.y + 120,
  });
  await pointerEvent(canvas, 'up', {
    pointerId: 1,
    pointerType: 'pen',
    x: penStart.x + 200,
    y: penStart.y + 120,
  });

  await expect(canvas).toHaveAttribute('data-object-count', '1');
});

test('pointer cancellation and lost capture release an in-progress pen gesture', async ({
  page,
}) => {
  const canvas = await openGuestCanvas(page);
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas did not render');

  const point = { x: box.x + 200, y: box.y + 180 };
  await pointerEvent(canvas, 'down', { pointerId: 30, pointerType: 'pen', ...point });
  await pointerEvent(canvas, 'move', {
    pointerId: 30,
    pointerType: 'pen',
    x: point.x + 120,
    y: point.y + 80,
  });
  await pointerEvent(canvas, 'cancel', {
    pointerId: 30,
    pointerType: 'pen',
    x: point.x + 120,
    y: point.y + 80,
  });

  await pointerEvent(canvas, 'down', { pointerId: 31, pointerType: 'pen', ...point });
  await pointerEvent(canvas, 'move', {
    pointerId: 31,
    pointerType: 'pen',
    x: point.x + 120,
    y: point.y + 80,
  });
  await pointerEvent(canvas, 'lostpointercapture', {
    pointerId: 31,
    pointerType: 'pen',
    x: point.x + 120,
    y: point.y + 80,
  });

  await expect(canvas).toHaveAttribute('data-object-count', '0');
  await pointerEvent(canvas, 'down', { pointerId: 32, pointerType: 'touch', ...point });
  await pointerEvent(canvas, 'move', {
    pointerId: 32,
    pointerType: 'touch',
    x: point.x + 120,
    y: point.y + 80,
  });
  await pointerEvent(canvas, 'up', {
    pointerId: 32,
    pointerType: 'touch',
    x: point.x + 120,
    y: point.y + 80,
  });
  await expect(canvas).toHaveAttribute('data-object-count', '0');
});

test('lost touch capture emits cancellation for the gesture recognizer', async ({ page }) => {
  const canvas = await openGuestCanvas(page);
  await selectDrawingInput(page, 'stylus-only');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas did not render');

  await canvas.evaluate((element) => {
    const events: string[] = [];
    const record = (event: Event) => events.push(event.type);
    element.addEventListener('pointercancel', record);
    element.addEventListener('pointerup', record);
    (element as HTMLCanvasElement & { __syntheticEndEvents?: string[] }).__syntheticEndEvents =
      events;
  });

  const point = { x: box.x + 200, y: box.y + 180 };
  await pointerEvent(canvas, 'down', { pointerId: 50, pointerType: 'touch', ...point });
  await pointerEvent(canvas, 'move', {
    pointerId: 50,
    pointerType: 'touch',
    x: point.x + 120,
    y: point.y + 80,
  });
  await pointerEvent(canvas, 'lostpointercapture', {
    pointerId: 50,
    pointerType: 'touch',
    x: point.x + 120,
    y: point.y + 80,
  });

  const endEvents = await canvas.evaluate((element) => {
    return (element as HTMLCanvasElement & { __syntheticEndEvents?: string[] })
      .__syntheticEndEvents;
  });
  // Playwright's synthetic PointerEvents do not update use-gesture's native
  // pointer bookkeeping. The policy test covers fresh pen admission after
  // cancellation; this browser test checks the cancellation bridge itself.
  expect(endEvents).toEqual(['pointercancel', 'pointerup']);
});

test('mouse drawing remains available and highlighter strokes can be undone', async ({ page }) => {
  const canvas = await openGuestCanvas(page);

  await page.getByRole('button', { name: 'Highlighter', exact: true }).first().click();
  await expect(
    page.getByRole('button', { name: 'Highlighter', exact: true }).first(),
  ).toHaveAttribute('aria-pressed', 'true');
  await drawStroke(canvas, 'mouse');
  await expect(canvas).toHaveAttribute('data-object-count', '1');

  await page.keyboard.press('Control+z');
  await expect(canvas).toHaveAttribute('data-object-count', '0');
});

test('tablet quick toolbar exposes highlighter and keeps its stroke undoable', async ({ page }) => {
  const canvas = await openGuestCanvas(page, { width: 900, height: 700 });
  const highlighter = page.getByRole('button', { name: 'Highlighter', exact: true });

  await expect(highlighter).toHaveCount(1);
  await expect(highlighter).toBeVisible();
  await highlighter.click();
  await expect(highlighter).toHaveAttribute('aria-pressed', 'true');
  await drawStroke(canvas, 'mouse');
  await expect(canvas).toHaveAttribute('data-object-count', '1');
  await page.keyboard.press('Control+z');
  await expect(canvas).toHaveAttribute('data-object-count', '0');
});

test('two-finger touch remains a non-drawing gesture', async ({ page }) => {
  const canvas = await openGuestCanvas(page);
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas did not render');

  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const client = await page.context().newCDPSession(page);
  const touchPoints = (left: number, right: number) => [
    { id: 40, x: left, y: center.y, radiusX: 8, radiusY: 8, force: 1 },
    { id: 41, x: right, y: center.y, radiusX: 8, radiusY: 8, force: 1 },
  ];
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: touchPoints(center.x - 50, center.x + 50),
  });
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: touchPoints(center.x - 160, center.x + 160),
  });
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });

  await expect(canvas).toHaveAttribute('data-object-count', '0');
});
