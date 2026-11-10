import { expect, test, type Page } from '@playwright/test';
import { installFakeSpeech } from './fakeSpeech';
import { fakeServer, offered } from './fakeServer';

// Stands in for the desktop app's preload bridge, keeping the page's command callback so the
// test can fire what the tray menu would send.
async function launch(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    let handler: ((c: string) => void) | null = null;
    w['tott'] = {
      onCommand: (cb: (c: string) => void) => {
        handler = cb;
        return () => {
          handler = null;
        };
      },
      setHeight: () => undefined,
      captureCardKeys: () => () => undefined,
      report: () => undefined,
    };
    w['fire'] = (c: string) => handler?.(c);
  });
  const server = await fakeServer(page);
  await page.goto('/');
  await expect(page.getByRole('status').first()).toHaveText('Connected');
  return server;
}
const fire = (page: Page, command: string) =>
  page.evaluate((c) => (window as unknown as { fire(c: string): void }).fire(c), command);

test.beforeEach(async ({ page }) => {
  await installFakeSpeech(page);
});

test('open-settings opens Settings with focus in it', async ({ page }) => {
  await launch(page);
  await fire(page, 'open-settings');
  const panel = page.getByRole('group', { name: 'Settings' });
  await expect(panel).toBeVisible();
  await expect(panel).toBeFocused();
});

test('open-settings shows a hidden overlay, and refocuses a panel that is already open', async ({
  page,
}) => {
  await launch(page);
  await fire(page, 'toggle-visible');
  await expect(page.locator('.overlay')).toHaveCount(0);
  await fire(page, 'open-settings');
  const panel = page.getByRole('group', { name: 'Settings' });
  await expect(panel).toBeFocused();
  await page.getByRole('combobox', { name: 'Language' }).focus();
  await fire(page, 'open-settings');
  await expect(panel).toBeFocused();
});

test('open-recent opens the drawer at Recent words, with this conversation’s words', async ({
  page,
}) => {
  const server = await launch(page);
  server.send({ type: 'stuck.detected', reason: 'pause', contextWindow: 'x' });
  server.send(
    offered('o1', [
      ['renewal', 0.9],
      ['chemist', 0.6],
    ]),
  );
  await fire(page, 'open-recent');
  const drawer = page.getByRole('region', { name: 'Meeting prep' });
  await expect(drawer).toBeVisible();
  const recent = drawer.getByRole('group', { name: 'Recent words' });
  await expect(recent).toBeFocused();
  await expect(recent.getByRole('listitem')).toHaveText(['renewal', 'chemist']);
});

test('open-recent with nothing offered says so, and closes Settings if it was open', async ({
  page,
}) => {
  await launch(page);
  await fire(page, 'open-settings');
  await expect(page.getByRole('group', { name: 'Settings' })).toBeVisible();
  await fire(page, 'open-recent');
  await expect(page.getByRole('group', { name: 'Settings' })).toHaveCount(0);
  await expect(page.getByText('No words offered yet.')).toBeVisible();
});

test('open-settings closes the drawer', async ({ page }) => {
  await launch(page);
  await fire(page, 'open-recent');
  await expect(page.getByRole('region', { name: 'Meeting prep' })).toBeVisible();
  await fire(page, 'open-settings');
  await expect(page.getByRole('region', { name: 'Meeting prep' })).toHaveCount(0);
});

test.describe('moving the desktop window', () => {
  const region = (page: Page, selector: string) =>
    page
      .locator(selector)
      .first()
      .evaluate((el) => getComputedStyle(el).getPropertyValue('-webkit-app-region'));

  test('the pill drags; its buttons, the settings, the drawer and the card do not', async ({
    page,
  }) => {
    const server = await launch(page);
    expect(await region(page, '.control-pill')).toBe('drag');
    expect(await region(page, '.control-pill button')).toBe('no-drag');
    await fire(page, 'open-settings');
    await expect(page.getByRole('group', { name: 'Settings' })).toBeVisible();
    expect(await region(page, '.settings-panel')).toBe('no-drag');
    expect(await region(page, '.settings-panel select')).toBe('no-drag');
    await fire(page, 'open-recent');
    await expect(page.getByRole('region', { name: 'Meeting prep' })).toBeVisible();
    expect(await region(page, '.prep')).toBe('no-drag');
    expect(await region(page, '.prep input')).toBe('no-drag');
    server.send({ type: 'stuck.detected', reason: 'pause', contextWindow: 'x' });
    server.send(offered('o1', [['renewal', 0.9]]));
    await expect(page.locator('.card-primary')).toBeVisible();
    expect(await region(page, '.card-slot')).toBe('no-drag');
  });

  test('a browser page has no drag region at all', async ({ page }) => {
    await fakeServer(page);
    await page.goto('/');
    await expect(page.getByRole('status').first()).toHaveText('Connected');
    expect(await region(page, '.control-pill')).not.toBe('drag');
  });
});
