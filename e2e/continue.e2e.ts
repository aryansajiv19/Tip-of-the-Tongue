import { expect, test, type Page } from '@playwright/test';
import { fakeServer } from './fakeServer';

async function open(page: Page) {
  const server = await fakeServer(page);
  await page.goto('/');
  await expect(page.getByRole('status').first()).toHaveText('Connected');
  await page.getByRole('button', { name: 'Settings' }).click();
  return server;
}

const toggle = (page: Page) => page.getByRole('checkbox', { name: 'Show how to continue' });
const sentSettings = (server: Awaited<ReturnType<typeof fakeServer>>) =>
  server.sent.filter((e) => e.type === 'session.settings' && 'continuations' in e);

test('is off by default, says what it does, and sends nothing until used', async ({ page }) => {
  const server = await open(page);
  await expect(toggle(page)).not.toBeChecked();
  await expect(page.getByText('Adds the next few words; slightly less accurate.')).toBeVisible();
  await page.waitForTimeout(600);
  expect(sentSettings(server)).toHaveLength(0);
});

test('turning it on and off is sent, kept, and sent again on a new connection', async ({
  page,
}) => {
  const server = await open(page);
  await toggle(page).check();
  await expect.poll(() => sentSettings(server).at(-1)?.continuations).toBe(true);
  await toggle(page).uncheck();
  await expect.poll(() => sentSettings(server).at(-1)?.continuations).toBe(false);
  await toggle(page).check();

  const server2 = await fakeServer(page);
  await page.reload();
  await expect.poll(() => sentSettings(server2).at(-1)?.continuations).toBe(true);
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(toggle(page)).toBeChecked();
});

test('"Works best with meeting notes" shows only when notes are loaded', async ({ page }) => {
  await open(page);
  await expect(page.getByText('Works best with meeting notes')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^Meeting prep/ }).click();
  await page.getByLabel('Meeting document').setInputFiles({
    name: 'agenda.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('Q3 review with Northwind Analytics. Renewal of the SOC 2 licence.'),
  });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByText('Works best with meeting notes')).toBeVisible();
});
