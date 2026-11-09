import { expect, test, type Page } from '@playwright/test';
import { installFakeSpeech, recognitionLang } from './fakeSpeech';
import { fakeServer } from './fakeServer';

test.beforeEach(async ({ page }) => {
  await installFakeSpeech(page);
});

const settings = (server: Awaited<ReturnType<typeof fakeServer>>) =>
  server.sent.filter((e) => e.type === 'session.settings');

async function launch(page: Page, saved?: string) {
  if (saved) await page.addInitScript((l) => localStorage.setItem('tott.language', l), saved);
  const server = await fakeServer(page);
  await page.goto('/');
  await expect(page.getByRole('status').first()).toHaveText('Connected');
  return server;
}
const dropdown = (page: Page) => page.getByRole('combobox', { name: 'Language' });
async function openSettings(page: Page) {
  await page.getByRole('button', { name: 'Settings' }).click();
}

test('the dropdown lists the six languages, each in its own name, and sends nothing until chosen', async ({
  page,
}) => {
  const server = await launch(page);
  await openSettings(page);
  await expect(dropdown(page).locator('option')).toHaveText([
    'English',
    'Mixed languages',
    'Español',
    'Français',
    'Deutsch',
    'हिन्दी',
  ]);
  await expect(dropdown(page)).toHaveValue('en');
  await page.waitForTimeout(400);
  expect(settings(server)).toEqual([]);
});

test('choosing a language sends it alone, keeps it, and sends it again after a reload', async ({
  page,
}) => {
  const server = await launch(page);
  await openSettings(page);
  await dropdown(page).selectOption('fr');
  await expect
    .poll(() => settings(server).at(-1))
    .toEqual({ type: 'session.settings', language: 'fr' });
  expect(await page.evaluate(() => localStorage.getItem('tott.language'))).toBe('fr');

  await page.reload();
  await expect(page.getByRole('status').first()).toHaveText('Connected');
  await expect
    .poll(() => settings(server).at(-1))
    .toEqual({ type: 'session.settings', language: 'fr' });
  await openSettings(page);
  await expect(dropdown(page)).toHaveValue('fr');
});

test('the language does not disturb the sensitivity: each is its own message', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tott.sensitivity', 'calm'));
  const server = await launch(page);
  await expect
    .poll(() => settings(server).find((e) => 'pauseMs' in e))
    .toMatchObject({ pauseMs: 2500 });
  await openSettings(page);
  await dropdown(page).selectOption('de');
  await expect
    .poll(() => settings(server).at(-1))
    .toEqual({ type: 'session.settings', language: 'de' });
});

test('Mixed languages explains itself, and only then', async ({ page }) => {
  await launch(page);
  await openSettings(page);
  const hint = page.getByText('Use when you switch between languages mid-sentence');
  await expect(hint).toHaveCount(0);
  await dropdown(page).selectOption('multi');
  await expect(hint).toBeVisible();
  await expect(dropdown(page)).toHaveAccessibleDescription(/switch between languages/);
  await dropdown(page).selectOption('es');
  await expect(hint).toHaveCount(0);
});

test('the browser speech recogniser listens in the chosen language, and restarts on a change', async ({
  page,
}) => {
  await launch(page, 'es');
  await page.getByRole('button', { name: 'Start listening' }).click();
  await expect.poll(() => recognitionLang(page)).toBe('es-ES');
  await openSettings(page);
  await dropdown(page).selectOption('hi');
  await expect.poll(() => recognitionLang(page)).toBe('hi-IN');
  await dropdown(page).selectOption('multi');
  await expect
    .poll(() => recognitionLang(page))
    .toBe(await page.evaluate(() => navigator.language));
});

test('the dropdown is easy to hit and takes keyboard focus', async ({ page }) => {
  await launch(page);
  await openSettings(page);
  const box = await dropdown(page).boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
  await dropdown(page).focus();
  await expect(dropdown(page)).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dropdown(page)).not.toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dropdown(page)).toBeFocused();
});
