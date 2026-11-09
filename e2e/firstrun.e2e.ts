import { expect, test, type Page } from '@playwright/test';
import { failRecognition, installFakeSpeech, instanceCount, say } from './fakeSpeech';

// Not through open(): that adds ?debug=1, and a first-time user has no such thing.
async function launch(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('status').first()).toHaveText('Server: connected');
}

const pill = (page: Page) => page.getByRole('group', { name: 'Listening controls' });
const start = (page: Page) => pill(page).getByRole('button', { name: 'Start listening' });
const contextButton = (page: Page) => pill(page).getByRole('button', { name: /^Meeting prep/ });
const line = (page: Page, text: string | RegExp) =>
  page.getByRole('status').filter({ hasText: text });

test.beforeEach(async ({ page }) => {
  await installFakeSpeech(page);
});

test('a first-time user is told what to do, and only until they press Start', async ({ page }) => {
  await launch(page);
  await expect(line(page, /Press play and talk/)).toBeVisible();
  await start(page).click();
  await expect(line(page, /Press play and talk/)).toHaveCount(0);
  await expect(
    line(page, /Listening\. I\u2019ll only speak up when you pause on a word/),
  ).toBeVisible();

  await page.reload();
  await expect(page.getByRole('status').first()).toHaveText('Server: connected');
  await expect(line(page, /Press play and talk/)).toHaveCount(0);
});

test('while listening, the last six words heard show faintly, and New conversation clears them', async ({
  page,
}) => {
  await launch(page);
  await start(page).click();
  await say(page, [['one two three four five six seven eight', true]]);
  const heard = page.locator('.overlay-heard');
  await expect(heard).toHaveText('Heard: three four five six seven eight');
  await pill(page).getByRole('button', { name: 'New conversation' }).click();
  await expect(heard).toHaveText('');
});

test('a blocked microphone puts the pill back to play, with the reason and a Retry', async ({
  page,
}) => {
  await launch(page);
  await start(page).click();
  await expect(pill(page).getByRole('button', { name: 'Pause listening' })).toBeVisible();
  await failRecognition(page, 'not-allowed');

  const alert = page.getByRole('alert').filter({ hasText: 'Microphone access was blocked' });
  await expect(alert).toBeVisible();
  await expect(start(page)).toBeVisible();
  await expect(pill(page).getByRole('timer')).toHaveText(/00:0\d/);

  const before = await instanceCount(page);
  await alert.getByRole('button', { name: 'Retry' }).click();
  await expect(pill(page).getByRole('button', { name: 'Pause listening' })).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'Microphone access' })).toHaveCount(0);
  expect(await instanceCount(page)).toBeGreaterThan(before);
});

test('the context button invites first, then names the loaded file, with a tooltip', async ({
  page,
}) => {
  await launch(page);
  await expect(contextButton(page)).toHaveText('Add context');
  await expect(contextButton(page)).toHaveAttribute('title', /so I know your names and terms/);

  await contextButton(page).click();
  await expect(page.getByRole('region', { name: 'Meeting prep' })).toContainText(
    'so I know your names and terms. Stays on this device.',
  );
  await page.getByLabel('Meeting document').setInputFiles({
    name: 'a-rather-long-agenda-for-the-quarterly-review-with-northwind.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('Q3 review with Northwind Analytics.'),
  });
  await expect(contextButton(page)).toContainText(/^Meeting\s\u00b7 a-rather-long/);
  await expect(contextButton(page)).toHaveAttribute('title', /^Meeting\s\u00b7 a-rather-long/);
  await page.getByRole('button', { name: /^Remove / }).click();
  await expect(contextButton(page)).toHaveText('Add context');
});

test('nothing in the pill overlaps: the label, chevron and keycaps stay apart and inside', async ({
  page,
}) => {
  await launch(page);
  await contextButton(page).click();
  await page.getByLabel('Meeting document').setInputFiles({
    name: 'a-rather-long-agenda-for-the-quarterly-review-with-northwind.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('Q3 review with Northwind Analytics.'),
  });
  await expect(contextButton(page)).toContainText('Meeting');
  const box = async (loc: ReturnType<Page['locator']>) => {
    const b = await loc.boundingBox();
    if (!b) throw new Error('not visible');
    return b;
  };
  const pillBox = await box(pill(page));
  const label = await box(contextButton(page));
  const caps = pill(page).locator('.keycap');
  const first = await box(caps.nth(0));
  const gear = await box(pill(page).getByRole('button', { name: 'Settings' }));
  expect(label.x + label.width).toBeLessThanOrEqual(first.x);
  expect(first.x + first.width).toBeLessThanOrEqual((await box(caps.nth(1))).x);
  expect((await box(caps.nth(1))).x + (await box(caps.nth(1))).width).toBeLessThanOrEqual(gear.x);
  expect(gear.x + gear.width).toBeLessThanOrEqual(pillBox.x + pillBox.width);
});

test('each keycap says what it does, to a screen reader and as a tooltip', async ({ page }) => {
  await launch(page);
  const caps = pill(page).locator('.keycap');
  await expect(caps.nth(0)).toHaveAccessibleName(/start or pause listening/);
  await expect(caps.nth(0)).toHaveAttribute('title', 'Start or pause listening');
  await expect(caps.nth(1)).toHaveAccessibleName(/stuck/);
  await expect(caps.nth(1)).toHaveAttribute('title', /stuck/);
});

test('each sensitivity says, in plain words, how long a pause it waits for', async ({ page }) => {
  await launch(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  const panel = page.getByRole('group', { name: 'Settings' });
  await expect(panel).toContainText('1.5 s pause');
  await panel.getByLabel('Eager').check({ force: true });
  await expect(panel).toContainText('0.9 s pause');
  await panel.getByLabel('Calm').check({ force: true });
  await expect(panel).toContainText('2.5 s pause');
});

test.describe('at the 340 px overlay width', () => {
  test.use({ viewport: { width: 700, height: 600 } });

  test('the context label and the rest of the pill are shown in full', async ({ page }) => {
    await launch(page);
    const label = contextButton(page).locator('.pill-mode-text');
    const fits = () => label.evaluate((e) => e.scrollWidth <= e.clientWidth);
    expect((await pill(page).boundingBox())?.width).toBe(340);
    await expect(label).toHaveText('Add context');
    expect(await fits()).toBe(true);

    // Nothing else in the pill is squeezed out either.
    for (const el of await pill(page).locator('.pill-timer, .keycap').all()) {
      expect(await el.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
    }
  });

  test('Retry sits below the blocked-microphone text, not over it', async ({ page }) => {
    await launch(page);
    await start(page).click();
    await failRecognition(page, 'not-allowed');
    const alert = page.getByRole('alert').filter({ hasText: 'Microphone access was blocked' });
    const retry = alert.getByRole('button', { name: 'Retry' });
    await expect(retry).toBeVisible();
    const text = await alert.evaluate((el) => {
      const range = document.createRange();
      const node = [...el.childNodes].find((n) => n.nodeType === Node.TEXT_NODE);
      if (!node) throw new Error('no text');
      range.selectNodeContents(node);
      const r = range.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
    });
    const button = await retry.boundingBox();
    const box = await alert.boundingBox();
    if (!button || !box) throw new Error('not visible');
    expect(button.y).toBeGreaterThanOrEqual(text.bottom);
    expect(button.x + button.width).toBeLessThanOrEqual(box.x + box.width);
    expect(button.y + button.height).toBeLessThanOrEqual(box.y + box.height);
  });

  test('with a document loaded the chip still starts with "Meeting", and the file name gives way', async ({
    page,
  }) => {
    await launch(page);
    await contextButton(page).click();
    await page.getByLabel('Meeting document').setInputFiles({
      name: 'a-rather-long-agenda-for-the-quarterly-review-with-northwind.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from('Q3 review with Northwind Analytics.'),
    });
    const lead = contextButton(page).locator('.pill-mode-lead');
    const file = contextButton(page).locator('.pill-mode-file');
    await expect(lead).toHaveText('Meeting');
    expect(await lead.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
    expect(await file.evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(true);
    expect(await contextButton(page).innerText()).toMatch(/^Meeting/);
  });

  test('a drawer taller than the window scrolls inside, so the last remembered word can be reached', async ({
    page,
  }) => {
    await page.addInitScript(() =>
      localStorage.setItem(
        'tott.aboutYou',
        JSON.stringify({
          about: { name: '', role: '', words: '' },
          remembered: Array.from({ length: 80 }, (_, i) => `remembered-word-${i}`),
        }),
      ),
    );
    await launch(page);
    await contextButton(page).click();
    const drawer = page.getByRole('region', { name: 'Meeting prep' });
    const box = await drawer.boundingBox();
    expect(box?.height).toBeLessThanOrEqual(320);
    expect(await drawer.evaluate((e) => e.scrollHeight > e.clientHeight)).toBe(true);

    const last = drawer.getByRole('list', { name: 'Remembered' }).getByRole('listitem').last();
    await last.scrollIntoViewIfNeeded();
    const inside = await Promise.all([last.boundingBox(), drawer.boundingBox()]);
    const [item, frame] = inside;
    if (!item || !frame) throw new Error('not visible');
    expect(item.y).toBeGreaterThanOrEqual(frame.y);
    expect(item.y + item.height).toBeLessThanOrEqual(frame.y + frame.height);
    await expect(drawer.getByRole('button', { name: 'Forget' })).toBeVisible();
  });

  test('the drop-zone explanation is centred under its heading', async ({ page }) => {
    await launch(page);
    await contextButton(page).click();
    const why = page.getByText('so I know your names and terms. Stays on this device.');
    expect(await why.evaluate((e) => getComputedStyle(e).textAlign)).toBe('center');
  });
});
