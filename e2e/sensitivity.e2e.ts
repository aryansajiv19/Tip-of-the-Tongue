import { expect, test, type Page } from '@playwright/test';
import { open } from './helpers';

// The settings popover owns the control. Until then the saved choice is what the page sends.
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

test('sends nothing when no sensitivity was ever chosen', async ({ page }) => {
  const sent = sentSettings(page);
  await open(page);
  await page.waitForTimeout(300);
  expect(sent).toEqual([]);
});

for (const [name, pauseMs, minConfidence] of [
  ['calm', 2500, 0.75],
  ['balanced', 1500, 0.6],
  ['eager', 900, 0.45],
] as const) {
  test(`a saved "${name}" is sent on connect as ${pauseMs} ms and ${minConfidence}`, async ({
    page,
  }) => {
    const sent = sentSettings(page);
    await page.addInitScript((value) => localStorage.setItem('tott.sensitivity', value), name);
    await open(page);
    await expect
      .poll(() => sent.at(-1))
      .toEqual({ type: 'session.settings', pauseMs, minConfidence });
  });
}

test('a saved value it does not know is ignored', async ({ page }) => {
  const sent = sentSettings(page);
  await page.addInitScript(() => localStorage.setItem('tott.sensitivity', 'wild'));
  await open(page);
  await page.waitForTimeout(300);
  expect(sent).toEqual([]);
});
