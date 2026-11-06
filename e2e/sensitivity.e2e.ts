import { expect, test, type Page } from '@playwright/test';
import { open } from './helpers';

// Collects what the page sends over its WebSocket. Call before open().
function sentSettings(page: Page) {
  const sent: unknown[] = [];
  page.on('websocket', (ws) =>
    ws.on('framesent', (f) => {
      if (typeof f.payload !== 'string') return;
      const e: { type?: string } = JSON.parse(f.payload);
      if (e.type === 'session.settings') sent.push(e);
    }),
  );
  return sent;
}

async function openBeforeTheMeeting(page: Page) {
  await page.locator('summary', { hasText: 'Before the meeting' }).click();
}

test('sends nothing until the user chooses a sensitivity, and Balanced is shown', async ({
  page,
}) => {
  const sent = sentSettings(page);
  await open(page);
  await openBeforeTheMeeting(page);
  await expect(page.getByRole('radio', { name: 'Balanced' })).toBeChecked();
  await page.waitForTimeout(300);
  expect(sent).toEqual([]);
});

for (const [name, pauseMs, minConfidence] of [
  ['Calm', 2500, 0.75],
  ['Balanced', 1500, 0.6],
  ['Eager', 900, 0.45],
] as const) {
  test(`${name} sends a wait of ${pauseMs} ms and a confidence of ${minConfidence}`, async ({
    page,
  }) => {
    const sent = sentSettings(page);
    await open(page);
    await openBeforeTheMeeting(page);
    // Pick something else first so that Balanced is a real change too.
    await page.getByRole('radio', { name: name === 'Eager' ? 'Calm' : 'Eager' }).check();
    await page.getByRole('radio', { name }).check();
    await expect
      .poll(() => sent.at(-1))
      .toEqual({ type: 'session.settings', pauseMs, minConfidence });
  });
}

test('the sensitivity is remembered after a reload and sent again', async ({ page }) => {
  const sent = sentSettings(page);
  await open(page);
  await openBeforeTheMeeting(page);
  await page.getByRole('radio', { name: 'Calm' }).check();
  await page.reload();
  await openBeforeTheMeeting(page);
  await expect(page.getByRole('radio', { name: 'Calm' })).toBeChecked();
  await expect.poll(() => sent.length).toBeGreaterThanOrEqual(2);
  expect(sent.at(-1)).toEqual({ type: 'session.settings', pauseMs: 2500, minConfidence: 0.75 });
});

test('the radio buttons work from the keyboard', async ({ page }) => {
  await open(page);
  await openBeforeTheMeeting(page);
  await page.getByRole('radio', { name: 'Balanced' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: 'Eager' })).toBeChecked();
});
