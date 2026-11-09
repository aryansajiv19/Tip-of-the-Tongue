import { expect, test, type Page } from '@playwright/test';
import { installFakeSpeech } from './fakeSpeech';
import { fakeServer, offered } from './fakeServer';
import { offer, offerEverSeen, open, say, watchOffers } from './helpers';

const status = (page: Page) => page.getByRole('status').first();
const question = (page: Page) => page.getByRole('group', { name: /How should I help/ });
const THREE: [string, number][] = [
  ['renewal', 0.9],
  ['chemist', 0.6],
  ['whisk', 0.5],
];
const primary = (page: Page) => offer(page).locator('.card-primary');

async function launch(page: Page, level?: string) {
  if (level) await page.addInitScript((l) => localStorage.setItem('tott.help', l), level);
  const server = await fakeServer(page);
  await page.goto('/');
  await expect(status(page)).toHaveText('Server: connected');
  return server;
}
const helpFrames = (server: Awaited<ReturnType<typeof fakeServer>>) =>
  server.sent.filter((e) => e.type === 'session.help');
const picked = (server: Awaited<ReturnType<typeof fakeServer>>) =>
  server.sent.filter((e) => e.type === 'guess.picked');

test.beforeEach(async ({ page }) => {
  await installFakeSpeech(page);
});

test.describe('the first-run question', () => {
  test('is asked once, with the three choices, and nothing is sent before the answer', async ({
    page,
  }) => {
    const server = await launch(page);
    await expect(question(page)).toBeVisible();
    await expect(question(page).getByRole('button')).toHaveText([
      'First sound',
      'Whole word',
      'Only when I ask',
    ]);
    await page.waitForTimeout(500);
    expect(helpFrames(server)).toEqual([]);

    await question(page).getByRole('button', { name: 'First sound' }).click();
    await expect(question(page)).toHaveCount(0);
    await expect.poll(() => helpFrames(server)).toEqual([{ type: 'session.help', level: 'sound' }]);
    expect(await page.evaluate(() => localStorage.getItem('tott.help'))).toBe('sound');

    await page.reload();
    await expect(status(page)).toHaveText('Server: connected');
    await expect(question(page)).toHaveCount(0);
    await expect
      .poll(() => helpFrames(server).at(-1))
      .toEqual({ type: 'session.help', level: 'sound' });
  });

  test('its buttons are easy to hit', async ({ page }) => {
    await launch(page);
    for (const b of await question(page).getByRole('button').all()) {
      const box = await b.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
      expect(box?.width).toBeGreaterThanOrEqual(44);
    }
  });

  test('can be changed later in Settings, with a plain hint for each choice', async ({ page }) => {
    const server = await launch(page, 'word');
    await page.getByRole('button', { name: 'Settings' }).click();
    const panel = page.getByRole('group', { name: 'Settings' });
    const group = panel.locator('fieldset').filter({ hasText: 'How I help' });
    await expect(group.getByLabel('Whole word')).toBeChecked();
    await expect(group).toContainText('Shows the whole suggested word');
    await group.getByLabel('First sound').check({ force: true });
    await expect(group).toContainText('first sound, like "w…"');
    await group.getByLabel('Only when I ask').check({ force: true });
    await expect(group).toContainText('only when you press');
    await expect
      .poll(() => helpFrames(server).at(-1))
      .toEqual({ type: 'session.help', level: 'ask' });
    expect(await page.evaluate(() => localStorage.getItem('tott.help'))).toBe('ask');
  });
});

test.describe('first sound', () => {
  test('shows only the start of each word, in the same slot, and never the whole word', async ({
    page,
  }) => {
    const server = await launch(page, 'sound');
    server.send(offered('a', THREE, 'agenda.pdf'));
    await expect(primary(page)).toHaveText('r…');
    await expect(offer(page).locator('.card-alts button')).toHaveText(['ch…', 'wh…']);
    for (const word of ['renewal', 'chemist', 'whisk', 'agenda.pdf']) {
      await expect(offer(page)).not.toContainText(word);
    }
    // The same 36 px slot as the whole word.
    expect(await primary(page).evaluate((e) => getComputedStyle(e).fontSize)).toBe('36px');
    await expect(primary(page)).toHaveAccessibleName(/Show the word that starts r…/);
  });

  test('tapping a cue shows all the words, and then a word can be picked', async ({ page }) => {
    const server = await launch(page, 'sound');
    server.send(offered('a', THREE));
    await primary(page).click();
    await expect(primary(page)).toHaveText('renewal');
    expect(picked(server)).toEqual([]);
    await primary(page).click();
    await expect
      .poll(() => picked(server))
      .toEqual([{ type: 'guess.picked', id: 'a', word: 'renewal' }]);
  });

  test('Ctrl+Enter shows the words instead of asking again, then asks as usual', async ({
    page,
  }) => {
    const server = await launch(page, 'sound');
    await page.getByRole('button', { name: 'Start listening' }).click();
    server.send(offered('a', THREE));
    await expect(primary(page)).toHaveText('r…');
    await page.keyboard.press('Control+Enter');
    await expect(primary(page)).toHaveText('renewal');
    expect(server.count('stuck.manual')).toBe(0);
    await page.keyboard.press('Control+Enter');
    await expect.poll(() => server.count('stuck.manual')).toBe(1);
  });

  test('Ctrl+1 shows the words the first time and picks the second time', async ({ page }) => {
    const server = await launch(page, 'sound');
    server.send(offered('a', THREE));
    await expect(primary(page)).toHaveText('r…');
    await page.keyboard.press('Control+2');
    await expect(primary(page)).toHaveText('renewal');
    expect(picked(server)).toEqual([]);
    await page.keyboard.press('Control+2');
    await expect
      .poll(() => picked(server))
      .toEqual([{ type: 'guess.picked', id: 'a', word: 'chemist' }]);
  });

  test('a new suggestion is a cue again', async ({ page }) => {
    const server = await launch(page, 'sound');
    server.send(offered('a', THREE));
    await primary(page).click();
    await expect(primary(page)).toHaveText('renewal');
    server.send(offered('b', [['kettle', 0.9]]));
    await expect(primary(page)).toHaveText('k…');
  });

  test('saying the word still accepts it while only the cue is showing', async ({ page }) => {
    const server = await launch(page, 'sound');
    server.send(offered('a', THREE));
    await expect(primary(page)).toHaveText('r…');
    server.send({ type: 'guess.accepted', id: 'a', word: 'renewal', afterMs: 700 });
    await expect(offer(page).locator('.card-accepted')).toHaveText('renewal');
  });
});

test.describe('whole word and the default', () => {
  test('whole word shows words; so does no choice yet', async ({ page }) => {
    const server = await launch(page, 'word');
    server.send(offered('a', THREE));
    await expect(primary(page)).toHaveText('renewal');
    await page.reload();
    await expect(status(page)).toHaveText('Server: connected');
  });

  test('before the question is answered the whole word shows', async ({ page }) => {
    const server = await launch(page);
    await expect(question(page)).toBeVisible();
    server.send(offered('a', THREE));
    await expect(primary(page)).toHaveText('renewal');
  });
});

// The real server: "only when I ask" turns off suggestions after a mere pause.
test.describe('only when I ask', () => {
  const PAUSE = 'I will pick up my medicine from the';

  test('a pause alone gives nothing, and the manual key gives a suggestion', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('tott.help', 'ask'));
    await open(page);
    await page.getByRole('button', { name: 'Start listening' }).click();
    await watchOffers(page);
    await say(page, PAUSE);
    await page.waitForTimeout(5000);
    expect(await offerEverSeen(page)).toBe(false);

    await page.keyboard.press('Control+Enter');
    await expect(offer(page)).toContainText('pharmacy', { timeout: 6000 });
  });

  test('the same pause gives a suggestion under "whole word"', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('tott.help', 'word'));
    await open(page);
    await say(page, PAUSE);
    await expect(offer(page)).toContainText('pharmacy', { timeout: 8000 });
  });

  test('a spoken cue still gets a suggestion', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('tott.help', 'ask'));
    await open(page);
    await say(page, 'I need to go to the the place where you get medicine');
    await expect(offer(page)).toContainText('pharmacy', { timeout: 8000 });
  });
});
