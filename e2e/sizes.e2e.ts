import { expect, test, type Locator, type Page } from '@playwright/test';
import { installFakeSpeech } from './fakeSpeech';
import { fakeServer, offered } from './fakeServer';

// The owner asked for a bigger, easier overlay: every button and hit target at least 44 by 44 px,
// labels and status lines at least 14 px.
const MIN_TARGET = 44;
const MIN_TEXT = 14;

test.beforeEach(async ({ page }) => {
  await installFakeSpeech(page);
});

async function launch(page: Page) {
  const server = await fakeServer(page);
  await page.goto('/');
  await expect(page.getByRole('status').first()).toHaveText('Connected');
  return server;
}

// Panels slide in with a transform, which makes a box a hair under its real size (43.99998 px)
// until it stops. Wait for the entry animations on the element and everything around it to end.
const settle = (el: Locator) =>
  el.evaluate(async (node) => {
    const running: Animation[] = [];
    for (let n: Element | null = node; n; n = n.parentElement) {
      for (const a of n.getAnimations()) {
        // A shimmer that loops forever never ends and is not an entry.
        if (a.effect?.getComputedTiming().iterations !== Infinity) running.push(a);
      }
    }
    await Promise.all(running.map((a) => a.finished));
  });

async function expectTargets(list: Locator) {
  const all = await list.all();
  expect(all.length).toBeGreaterThan(0);
  for (const el of all) {
    await settle(el);
    const box = await el.boundingBox();
    const name = await el.evaluate(
      (e) => e.getAttribute('aria-label') ?? e.textContent ?? e.tagName,
    );
    expect(box?.width, `${name} width`).toBeGreaterThanOrEqual(MIN_TARGET);
    expect(box?.height, `${name} height`).toBeGreaterThanOrEqual(MIN_TARGET);
  }
}

const fontSize = (el: Locator) => el.evaluate((e) => parseFloat(getComputedStyle(e).fontSize));

test('every button in the pill is at least 44 by 44, and the label and status are 14 px or more', async ({
  page,
}) => {
  await launch(page);
  const pill = page.getByRole('group', { name: 'Listening controls' });
  await expectTargets(pill.getByRole('button'));
  expect(
    await fontSize(pill.getByRole('button', { name: /^Meeting prep/ })),
  ).toBeGreaterThanOrEqual(MIN_TEXT);
  expect(await fontSize(pill.getByRole('timer'))).toBeGreaterThanOrEqual(MIN_TEXT);
  const hint = page.getByRole('status').filter({ hasText: 'Press play and talk' });
  expect(await fontSize(hint)).toBeGreaterThanOrEqual(MIN_TEXT);
});

test('the suggestion card buttons are at least 44 by 44', async ({ page }) => {
  const server = await launch(page);
  server.send(
    offered('a', [
      ['renewal', 0.9],
      ['contract', 0.6],
      ['invoice', 0.5],
    ]),
  );
  const card = page.getByLabel('Word suggestions');
  await expect(card.getByRole('button').first()).toBeVisible();
  await expectTargets(card.getByRole('button'));
});

test('the drawer and settings controls are at least 44 by 44', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'tott.aboutYou',
      JSON.stringify({ about: { name: '', role: '', words: '' }, remembered: ['pharmacy'] }),
    ),
  );
  await launch(page);
  await page.getByRole('button', { name: /^Meeting prep/ }).click();
  const drawer = page.getByRole('region', { name: 'Meeting prep' });
  await page.getByLabel('Meeting document').setInputFiles({
    name: 'agenda.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('Q3 review with Northwind.'),
  });
  await expectTargets(drawer.getByRole('button'));
  await expectTargets(drawer.getByRole('textbox').filter({ hasNot: page.locator('textarea') }));
  expect(await fontSize(drawer.getByText('so I know your names and terms'))).toBeGreaterThanOrEqual(
    MIN_TEXT,
  );

  await page.getByRole('button', { name: /^Meeting prep/ }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  const settings = page.getByRole('group', { name: 'Settings' });
  await expectTargets(settings.getByRole('combobox'));
  await expectTargets(settings.locator('.settings-segments label'));
  for (const hint of await settings.locator('.settings-hint').all()) {
    expect(await fontSize(hint)).toBeGreaterThanOrEqual(MIN_TEXT);
  }
});
