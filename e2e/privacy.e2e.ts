import { expect, test } from '@playwright/test';
import { installFakeSpeech } from './fakeSpeech';
import { fakeServer } from './fakeServer';

const SAVED = {
  about: { name: 'Sam', role: 'CFO', words: 'Northwind' },
  remembered: ['renewal', 'chemist', 'whisk'],
};

test.beforeEach(async ({ page }) => {
  await installFakeSpeech(page);
  await page.addInitScript((s) => {
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('tott.aboutYou', JSON.stringify(s));
    }
  }, SAVED);
});

async function openSettings(page: import('@playwright/test').Page) {
  const server = await fakeServer(page);
  await page.goto('/');
  await expect(page.getByRole('status').first()).toHaveText('Connected');
  await page.getByRole('button', { name: 'Settings' }).click();
  return server;
}

test('every remembered word is listed and can be removed on its own', async ({ page }) => {
  await openSettings(page);
  const list = page.getByRole('list', { name: 'Remembered words' });
  await expect(list.getByRole('listitem')).toHaveText(['whisk', 'chemist', 'renewal']);
  await list.getByRole('button', { name: 'Forget chemist' }).click();
  await expect(list.getByRole('listitem')).toHaveText(['whisk', 'renewal']);
  const saved = await page.evaluate(() => localStorage.getItem('tott.aboutYou'));
  expect(JSON.parse(saved ?? '{}')).toMatchObject({ remembered: ['renewal', 'whisk'] });
  for (const b of await list.getByRole('button').all()) {
    const box = await b.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
});

test('Forget everything asks first, and Cancel changes nothing', async ({ page }) => {
  await openSettings(page);
  await page.getByRole('button', { name: 'Forget everything' }).click();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('list', { name: 'Remembered words' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('tott.aboutYou'))).not.toBeNull();
});

test('Forget everything clears About you, remembered words and the copy on this device', async ({
  page,
}) => {
  const server = await openSettings(page);
  // The server has the profile before it is forgotten, so the forgetting must reach it.
  await expect.poll(() => server.sent.filter((e) => e.type === 'session.profile')).toHaveLength(1);
  await page.getByRole('button', { name: 'Forget everything' }).click();
  await page.getByRole('button', { name: 'Yes, forget everything' }).click();
  await expect(page.getByText('None yet.')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('tott.aboutYou'))).toBeNull();
  await expect
    .poll(() => server.sent.filter((e) => e.type === 'session.profile').at(-1))
    .toEqual({ type: 'session.profile', words: [], remembered: [] });

  await page.getByRole('button', { name: /^Meeting prep/ }).click();
  await expect(page.getByLabel('Name')).toHaveValue('');
});

test('About you can be cleared on its own from the drawer', async ({ page }) => {
  await fakeServer(page);
  await page.goto('/');
  await expect(page.getByRole('status').first()).toHaveText('Connected');
  await page.getByRole('button', { name: /^Meeting prep/ }).click();
  await page.getByRole('button', { name: 'Clear About you' }).click();
  await expect(page.getByLabel('Name')).toHaveValue('');
  await expect(page.getByLabel('Words you often need')).toHaveValue('');
  await expect(page.getByRole('group', { name: 'Remembered words' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Clear About you' })).toHaveCount(0);
});
