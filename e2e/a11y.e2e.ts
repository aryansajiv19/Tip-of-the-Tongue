import { expect, test, type Page } from '@playwright/test';
import { installFakeSpeech } from './fakeSpeech';
import { fakeServer, offered } from './fakeServer';
import { offer } from './helpers';

test.beforeEach(async ({ page }) => {
  await installFakeSpeech(page);
});

async function launch(page: Page) {
  const server = await fakeServer(page);
  await page.goto('/');
  await expect(page.getByRole('status').first()).toHaveText('Connected');
  return server;
}

test('opening Settings moves focus in, and closing it gives focus back to the gear', async ({
  page,
}) => {
  await launch(page);
  const gear = page.getByRole('button', { name: 'Settings' });
  await gear.focus();
  await page.keyboard.press('Enter');
  const panel = page.getByRole('group', { name: 'Settings' });
  await expect(panel).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(gear).toBeFocused();
});

test('the same for the meeting drawer', async ({ page }) => {
  await launch(page);
  const opener = page.getByRole('button', { name: /^Meeting prep/ });
  await opener.focus();
  await page.keyboard.press('Enter');
  const drawer = page.getByRole('region', { name: 'Meeting prep' });
  await expect(drawer).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test('a problem line is not an alert nested in the live region', async ({ page }) => {
  const server = await launch(page);
  server.send({ type: 'guesser.status', ok: false });
  await expect(offer(page).locator('.card-problem')).toBeVisible();
  await expect(offer(page).getByRole('alert')).toHaveCount(0);
  await expect(page.locator('[aria-live] [role=alert]')).toHaveCount(0);
});

test('words set their own direction', async ({ page }) => {
  const server = await launch(page);
  server.send({ type: 'stuck.detected', reason: 'pause', contextWindow: 'x' });
  server.send(
    offered('o1', [
      ['שלום', 0.9],
      ['hello', 0.6],
    ]),
  );
  await expect(offer(page).locator('.card-primary')).toHaveAttribute('dir', 'auto');
  await expect(offer(page).locator('.card-alts button').first()).toHaveAttribute('dir', 'auto');
});

test('the pill says what its first key does: show or hide the overlay', async ({ page }) => {
  await launch(page);
  await expect(
    page.getByRole('img', { name: /backslash: show or hide this overlay/ }),
  ).toBeVisible();
});

test('no visible text is smaller than 14 px', async ({ page }) => {
  const server = await launch(page);
  server.send({ type: 'stuck.detected', reason: 'pause', contextWindow: 'x' });
  server.send(
    offered(
      'o1',
      [
        ['renewal', 0.9],
        ['chemist', 0.6],
      ],
      'agenda.pdf',
    ),
  );
  await page.getByRole('button', { name: /^Meeting prep/ }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  const small = await page.evaluate(() => {
    const out: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (!el || !n.textContent?.trim() || el.closest('.sr-only')) continue;
      const size = parseFloat(getComputedStyle(el).fontSize);
      if (size < 14) out.push(`${n.textContent.trim().slice(0, 20)} ${size}`);
    }
    return out;
  });
  expect(small).toEqual([]);
});

test('Large text scales the words, is kept, and comes back after a reload', async ({ page }) => {
  const server = await launch(page);
  const fontSize = async () => {
    server.send({ type: 'stuck.detected', reason: 'pause', contextWindow: 'x' });
    server.send(offered('o1', [['renewal', 0.9]]));
    const size = await offer(page)
      .locator('.card-primary')
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    return size;
  };
  expect(await fontSize()).toBe(36);
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByLabel('Large').check({ force: true });
  expect(await fontSize()).toBe(45);
  await page.reload();
  await expect(page.getByRole('status').first()).toHaveText('Connected');
  expect(await page.evaluate(() => document.documentElement.dataset['textSize'])).toBe('large');
});

test.describe('light theme', () => {
  test.use({ colorScheme: 'light' });
  test('the glass and text follow the system', async ({ page }) => {
    await launch(page);
    const colours = await page.locator('.control-pill').evaluate((el) => {
      const s = getComputedStyle(el);
      return { bg: s.backgroundColor, fg: s.color };
    });
    expect(colours.fg).toBe('rgb(29, 29, 31)');
    expect(colours.bg).toMatch(/^rgba\(250, 250, 252/);
  });
});

test('dark stays the default look', async ({ page }) => {
  await launch(page);
  const fg = await page.locator('.control-pill').evaluate((el) => getComputedStyle(el).color);
  expect(fg).toBe('rgb(245, 245, 247)');
});

test('Space does not ask for a word while a button has focus', async ({ page }) => {
  const server = await launch(page);
  await page.getByRole('button', { name: 'Start listening' }).click();
  await page.getByRole('button', { name: 'Settings' }).focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  expect(server.sent.filter((e) => e.type === 'stuck.manual')).toEqual([]);
});

test('Large text leaves the pill at its size, so its label still fits', async ({ page }) => {
  await launch(page);
  await page.evaluate(() => (document.documentElement.dataset['textSize'] = 'large'));
  const pill = page.locator('.control-pill');
  const size = await pill.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(size).toBe(14);
  const box = await pill.boundingBox();
  const last = await pill.getByRole('button').last().boundingBox();
  if (!box || !last) throw new Error('not visible');
  expect(last.x + last.width).toBeLessThanOrEqual(box.x + box.width);
});
