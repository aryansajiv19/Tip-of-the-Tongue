import { expect, test, type Page } from '@playwright/test';
import { fakeServer } from './fakeServer';

const status = (page: Page) => page.getByRole('status').first();
const drawer = (page: Page) => page.getByRole('region', { name: 'Meeting prep' });
const about = (page: Page) => drawer(page).getByRole('group', { name: 'About you' });
const remembered = (page: Page) => drawer(page).getByRole('group', { name: 'Remembered words' });

async function launch(page: Page) {
  const server = await fakeServer(page);
  await page.goto('/');
  await expect(status(page)).toHaveText('Connected');
  return server;
}
const openDrawer = (page: Page) => page.getByRole('button', { name: /^Meeting prep/ }).click();
const profiles = (server: Awaited<ReturnType<typeof fakeServer>>) =>
  server.sent.filter((e) => e.type === 'session.profile');

test('a user with nothing to say sends no profile', async ({ page }) => {
  const server = await launch(page);
  await page.waitForTimeout(700);
  expect(profiles(server)).toEqual([]);
});

test('About you is saved on this device, sent to the server, and sent again after a reload', async ({
  page,
}) => {
  const server = await launch(page);
  await openDrawer(page);
  await about(page).getByLabel('Name').fill('Dana Reyes');
  await about(page).getByLabel('Role').fill('product lead');
  await about(page).getByLabel('Words you often need').fill('Northwind, SOC 2\nheparin\nnorthwind');
  await expect
    .poll(() => profiles(server).at(-1))
    .toEqual({
      type: 'session.profile',
      name: 'Dana Reyes',
      role: 'product lead',
      words: ['Northwind', 'SOC 2', 'heparin'],
      remembered: [],
    });
  // Typing sends once after a pause, not once per key.
  expect(profiles(server).length).toBeLessThanOrEqual(2);

  await page.reload();
  await expect(status(page)).toHaveText('Connected');
  await openDrawer(page);
  await expect(about(page).getByLabel('Name')).toHaveValue('Dana Reyes');
  await expect(about(page).getByLabel('Role')).toHaveValue('product lead');
  await expect(about(page).getByLabel('Words you often need')).toHaveValue(
    'Northwind, SOC 2\nheparin\nnorthwind',
  );
  await expect.poll(() => profiles(server).at(-1)).toMatchObject({ name: 'Dana Reyes' });
  await expect(about(page)).toContainText('Saved on this device only');
});

test('accepted words are remembered, survive a reload, and Forget clears them', async ({
  page,
}) => {
  const server = await launch(page);
  server.send({ type: 'guess.accepted', id: 'a', word: 'pharmacy', afterMs: 800 });
  server.send({ type: 'guess.accepted', id: 'b', word: 'Northwind', afterMs: 900 });
  await openDrawer(page);
  await expect(remembered(page)).toContainText('pharmacy');
  await expect(remembered(page)).toContainText('Northwind');
  await expect
    .poll(() => profiles(server).at(-1))
    .toMatchObject({
      remembered: ['pharmacy', 'Northwind'],
    });

  const before = profiles(server).length;
  await page.reload();
  await expect(status(page)).toHaveText('Connected');
  await openDrawer(page);
  await expect(remembered(page)).toContainText('pharmacy');
  // The new connection is sent the saved words before they are forgotten.
  await expect.poll(() => profiles(server).length).toBeGreaterThan(before);

  await remembered(page).getByRole('button', { name: 'Forget' }).click();
  await expect(remembered(page)).toHaveCount(0);
  await expect.poll(() => profiles(server).at(-1)).toMatchObject({ remembered: [] });
  await page.reload();
  await openDrawer(page);
  await expect(remembered(page)).toHaveCount(0);
  const stored = await page.evaluate(() => localStorage.getItem('tott.aboutYou'));
  expect(stored).toBeNull();
});

test('only the words are kept, never anything said', async ({ page }) => {
  const server = await launch(page);
  server.send({ type: 'transcript.final', words: [{ text: 'secret', startMs: 0, endMs: 1 }] });
  server.send({ type: 'guess.accepted', id: 'a', word: 'pharmacy', afterMs: 800 });
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('tott.aboutYou')))
    .toBe(JSON.stringify({ about: { name: '', role: '', words: '' }, remembered: ['pharmacy'] }));
});
