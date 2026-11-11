import { expect, test, type Page } from '@playwright/test';
import { fakeServer } from './fakeServer';

async function open(page: Page) {
  const server = await fakeServer(page);
  await page.goto('/');
  await expect(page.getByRole('status').first()).toHaveText('Connected');
  return server;
}

const pill = (page: Page) => page.getByRole('group', { name: 'Listening controls' });
const mine = (page: Page) => pill(page).getByRole('button', { name: /That.s me/ });

test('not offered with one voice, offered from two, gone again when the count drops', async ({
  page,
}) => {
  const server = await open(page);
  await expect(mine(page)).toHaveCount(0);
  server.send({ type: 'speaker.count', n: 1 });
  await expect(mine(page)).toHaveCount(0);
  server.send({ type: 'speaker.count', n: 2 });
  await expect(mine(page)).toBeVisible();
  server.send({ type: 'speaker.count', n: 0 });
  await expect(mine(page)).toHaveCount(0);
});

test('pressing it tells the server, then the button gives way and the page says so', async ({
  page,
}) => {
  const server = await open(page);
  server.send({ type: 'speaker.count', n: 3 });
  await mine(page).click();
  await expect.poll(() => server.count('speaker.mine')).toBe(1);
  await expect(mine(page)).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'Got it' })).toBeVisible();
  // Still two voices: it stays away until the count falls and rises again.
  server.send({ type: 'speaker.count', n: 2 });
  await expect(mine(page)).toHaveCount(0);
  server.send({ type: 'speaker.count', n: 1 });
  server.send({ type: 'speaker.count', n: 2 });
  await expect(mine(page)).toBeVisible();
});

test('a new conversation takes it away', async ({ page }) => {
  const server = await open(page);
  server.send({ type: 'speaker.count', n: 2 });
  await expect(mine(page)).toBeVisible();
  await page.getByRole('button', { name: 'New conversation' }).click();
  server.send({ type: 'session.cleared' });
  await expect(mine(page)).toHaveCount(0);
});

test('with the button the pill is still 420 wide, nothing sticks out, targets are 44 px', async ({
  page,
}) => {
  const server = await open(page);
  server.send({ type: 'speaker.count', n: 2 });
  await expect(mine(page)).toBeVisible();
  const box = await pill(page).boundingBox();
  expect(box?.width).toBe(420);
  const out = await pill(page).evaluate((el) => {
    const r = el.getBoundingClientRect();
    return [...el.children].filter((c) => {
      const b = c.getBoundingClientRect();
      return b.left < r.left - 0.5 || b.right > r.right + 0.5;
    }).length;
  });
  expect(out).toBe(0);
  for (const b of await pill(page).getByRole('button').all()) {
    const bb = await b.boundingBox();
    expect(bb?.width).toBeGreaterThanOrEqual(44);
    expect(bb?.height).toBeGreaterThanOrEqual(44);
  }
  expect(
    await mine(page).evaluate((e) => parseFloat(getComputedStyle(e).fontSize)),
  ).toBeGreaterThanOrEqual(14);
});

test('works from the keyboard', async ({ page }) => {
  const server = await open(page);
  server.send({ type: 'speaker.count', n: 2 });
  await mine(page).focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => server.count('speaker.mine')).toBe(1);
});
