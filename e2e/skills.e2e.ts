import { expect, test, type Page } from '@playwright/test';
import { fakeServer } from './fakeServer';

async function open(page: Page) {
  const server = await fakeServer(page);
  await page.goto('/');
  await expect(page.getByRole('status').first()).toHaveText('Connected');
  await page.getByRole('button', { name: 'Settings' }).click();
  return server;
}

const lastSkills = (server: Awaited<ReturnType<typeof fakeServer>>) =>
  server.sent.filter((e) => e.type === 'session.skills').at(-1)?.skills as
    { name: string; description?: string; terms: string[] }[] | undefined;

test('nothing is sent until a skill is on', async ({ page }) => {
  const server = await open(page);
  await page.waitForTimeout(800);
  expect(server.count('session.skills')).toBe(0);
});

test('a built-in pack is sent with its hint, and turning it off sends an empty list', async ({
  page,
}) => {
  const server = await open(page);
  const pack = page.getByRole('checkbox', { name: /Medical visit/ });
  await pack.check();
  await expect.poll(() => lastSkills(server)?.map((s) => s.name)).toEqual(['Medical visit']);
  const [sent] = lastSkills(server) ?? [];
  expect(sent?.description).toBeTruthy();
  expect(sent?.terms.length).toBeGreaterThan(10);
  await pack.uncheck();
  await expect.poll(() => lastSkills(server)).toEqual([]);
});

test('a custom skill: create, see it sent, edit, delete; it survives a reload and a reconnect', async ({
  page,
}) => {
  const server = await open(page);
  await page.getByRole('button', { name: 'New skill' }).click();
  await page.getByLabel('Name').fill('Boat club');
  await page.getByLabel(/Words, separated/).fill('jib, genoa\nkeel, jib');
  await expect(page.getByText('3 of 60 words')).toBeVisible();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect
    .poll(() => lastSkills(server))
    .toEqual([{ name: 'Boat club', terms: ['jib', 'genoa', 'keel'] }]);

  await page.getByRole('button', { name: 'Edit Boat club' }).click();
  await page.getByLabel(/Words, separated/).fill('jib');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect.poll(() => lastSkills(server)?.[0]?.terms).toEqual(['jib']);

  // The same list goes again after a reload (a new connection).
  const server2 = await fakeServer(page);
  await page.reload();
  await expect.poll(() => lastSkills(server2)?.[0]?.name).toBe('Boat club');

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Delete Boat club' }).click();
  await expect.poll(() => lastSkills(server2)).toEqual([]);
  await expect(page.getByRole('button', { name: 'Edit Boat club' })).toHaveCount(0);
});

test('at most 5 are on: the rest of the switches and New skill are disabled', async ({ page }) => {
  await open(page);
  const packs = page.locator('.settings-pack input');
  const n = await packs.count();
  expect(n).toBeGreaterThanOrEqual(5);
  for (let i = 0; i < 5; i++) await packs.nth(i).check();
  for (let i = 5; i < n; i++) await expect(packs.nth(i)).toBeDisabled();
  await expect(page.getByRole('button', { name: 'New skill' })).toBeDisabled();
});

test('Privacy lists the skills with a remove button each, and Forget everything clears them', async ({
  page,
}) => {
  const server = await open(page);
  await page.getByRole('checkbox', { name: /Medical visit/ }).check();
  await page.getByRole('button', { name: 'New skill' }).click();
  await page.getByLabel('Name').fill('Boat club');
  await page.getByRole('button', { name: 'Save' }).click();
  const list = page.getByRole('list', { name: 'Skills kept' });
  await expect(list.getByRole('listitem')).toHaveText(['Medical visit', 'Boat club']);
  await list.getByRole('button', { name: 'Remove Medical visit' }).click();
  await expect(list.getByRole('listitem')).toHaveText(['Boat club']);
  await expect(page.getByRole('checkbox', { name: /Medical visit/ })).not.toBeChecked();
  await expect.poll(() => lastSkills(server)?.map((s) => s.name)).toEqual(['Boat club']);

  await page.getByRole('button', { name: 'Forget everything' }).click();
  await page.getByRole('button', { name: 'Yes, forget everything' }).click();
  await expect.poll(() => lastSkills(server)).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem('tott.skills'))).toBeNull();
});

test('is usable by keyboard and its targets are at least 44 px', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'New skill' }).focus();
  await page.keyboard.press('Enter');
  await page.getByLabel('Name').fill('Quiz');
  await page.keyboard.press('Enter'); // submits the form
  await expect(page.getByRole('button', { name: 'Edit Quiz' })).toBeVisible();
  for (const name of ['Edit Quiz', 'Delete Quiz']) {
    const box = await page.getByRole('button', { name }).boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
});
