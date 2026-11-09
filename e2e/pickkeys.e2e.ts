import { expect, test, type Page } from '@playwright/test';
import { fakeServer, offered, stuck } from './fakeServer';
import { offer } from './helpers';

async function launch(page: Page) {
  const server = await fakeServer(page);
  await page.goto('/');
  await expect(page.getByRole('status').first()).toHaveText('Server: connected');
  return server;
}

const THREE: [string, number][] = [
  ['renewal', 0.9],
  ['contract', 0.6],
  ['invoice', 0.5],
];
const picked = (server: Awaited<ReturnType<typeof fakeServer>>) =>
  server.sent.filter((e) => e.type === 'guess.picked');

test.describe('in a browser', () => {
  for (const [key, index, word] of [
    ['Control+1', 0, 'renewal'],
    ['Control+2', 1, 'contract'],
    ['Control+3', 2, 'invoice'],
  ] as const) {
    test(`${key} picks suggestion ${index + 1}`, async ({ page }) => {
      const server = await launch(page);
      server.send(offered('a', THREE));
      await expect(offer(page).locator('.card-primary')).toHaveText('renewal');
      await page.keyboard.press(key);
      await expect(offer(page)).toContainText(word);
      await expect(offer(page).locator('.card-accepted')).toBeVisible();
      expect(picked(server)).toEqual([{ type: 'guess.picked', id: 'a', word }]);
    });
  }

  test('Meta works the same as Control', async ({ page }) => {
    const server = await launch(page);
    server.send(offered('a', THREE));
    await expect(offer(page).locator('.card-primary')).toBeVisible();
    await page.keyboard.press('Meta+2');
    await expect
      .poll(() => picked(server))
      .toEqual([{ type: 'guess.picked', id: 'a', word: 'contract' }]);
  });

  test('a number with no suggestion behind it, a bare digit and other modifiers do nothing', async ({
    page,
  }) => {
    const server = await launch(page);
    server.send(offered('a', THREE.slice(0, 2)));
    await expect(offer(page).locator('.card-primary')).toBeVisible();
    for (const key of [
      'Control+3',
      'Control+4',
      '1',
      'Control+Shift+1',
      'Alt+1',
      'Control+Alt+2',
    ]) {
      await page.keyboard.press(key);
    }
    await page.waitForTimeout(200);
    expect(picked(server)).toEqual([]);
    await expect(offer(page).locator('.card-primary')).toBeVisible();
  });

  test('with no suggestion showing, or only "finding the word", the keys do nothing', async ({
    page,
  }) => {
    const server = await launch(page);
    await page.keyboard.press('Control+1');
    server.send(stuck);
    await expect(offer(page)).toContainText('Finding the word');
    await page.keyboard.press('Control+1');
    await page.waitForTimeout(200);
    expect(picked(server)).toEqual([]);
  });

  test('the card shows which key picks which word', async ({ page }) => {
    const server = await launch(page);
    server.send(offered('a', THREE));
    const mod = await page.evaluate(() => (/mac/i.test(navigator.platform) ? '⌘' : 'Ctrl'));
    await expect(offer(page).locator('.keycap')).toHaveText([`${mod}1`, `${mod}2`, `${mod}3`]);
    await expect(offer(page).getByRole('button', { name: 'contract' })).toHaveAttribute(
      'aria-keyshortcuts',
      /\+2$/,
    );
  });
});

// The desktop overlay never has focus, so its page asks the main process for the keys. A stand-in
// for the preload bridge records what the page asks for and lets the test press a "global shortcut".
test.describe('in the desktop app', () => {
  type Bridge = { calls: (number | null)[]; press(key: 'escape' | 1 | 2 | 3): void };
  const bridge = (page: Page) =>
    page.evaluate(() => (window as unknown as { fake: Bridge }).fake.calls);
  const press = (page: Page, key: 'escape' | 1 | 2 | 3) =>
    page.evaluate((k) => (window as unknown as { fake: Bridge }).fake.press(k), key);

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      let handler: ((key: 'escape' | 1 | 2 | 3) => void) | undefined;
      const fake: Bridge = {
        calls: [],
        press: (key) => handler?.(key),
      };
      (window as unknown as { fake: Bridge }).fake = fake;
      (window as unknown as { tott: unknown }).tott = {
        onCommand: () => () => undefined,
        setHeight: () => undefined,
        report: () => undefined,
        captureCardKeys(picks: number, cb: typeof handler) {
          fake.calls.push(picks);
          handler = cb;
          return () => {
            fake.calls.push(null);
            handler = undefined;
          };
        },
      };
    });
  });

  test('asks for Esc and as many number keys as there are suggestions, and gives them back', async ({
    page,
  }) => {
    const server = await launch(page);
    expect(await bridge(page)).toEqual([]);
    server.send(stuck);
    await expect(offer(page)).toContainText('Finding the word');
    expect(await bridge(page)).toEqual([0]);

    server.send(offered('a', THREE.slice(0, 2)));
    await expect(offer(page).locator('.card-primary')).toBeVisible();
    expect((await bridge(page)).at(-1)).toBe(2);

    server.send({ type: 'guess.withdrawn', id: 'a', reason: 'timeout' });
    await expect(offer(page).locator('.card-primary')).toHaveCount(0);
    expect((await bridge(page)).at(-1)).toBeNull();
  });

  test('a shortcut pressed in the main process picks that suggestion, and Esc dismisses', async ({
    page,
  }) => {
    const server = await launch(page);
    server.send(offered('a', THREE));
    await expect(offer(page).locator('.card-primary')).toBeVisible();
    await press(page, 3);
    await expect
      .poll(() => picked(server))
      .toEqual([{ type: 'guess.picked', id: 'a', word: 'invoice' }]);

    server.send(offered('b', THREE));
    await expect(offer(page).locator('.card-primary')).toBeVisible();
    await press(page, 'escape');
    await expect(offer(page).locator('.card-primary')).toHaveCount(0);
    expect(picked(server)).toHaveLength(1);
  });

  test('does not ask the main process again on every re-render', async ({ page }) => {
    const server = await launch(page);
    server.send(offered('a', THREE));
    await expect(offer(page).locator('.card-primary')).toBeVisible();
    const before = (await bridge(page)).length;
    server.send({ type: 'guesser.status', ok: true });
    server.send({ type: 'brief.terms', terms: [] });
    await page.waitForTimeout(300);
    expect((await bridge(page)).length).toBe(before);
  });
});
