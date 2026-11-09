import { expect, test } from '@playwright/test';
import { installFakeSpeech } from './fakeSpeech';
import { fakeServer, offered } from './fakeServer';
import { offer } from './helpers';

test.beforeEach(async ({ page }) => {
  await installFakeSpeech(page);
});

const THREE: [string, number][] = [
  ['renewal', 0.9],
  ['chemist', 0.6],
];

test('the card stays while hovered and goes after it is left; recent words are listed', async ({
  page,
}) => {
  const server = await fakeServer(page);
  await page.goto('/');
  await expect(page.getByRole('status').first()).toHaveText('Server: connected');
  server.send({ type: 'stuck.detected', reason: 'pause', contextWindow: 'the' });
  server.send(offered('o1', THREE));
  const card = offer(page).locator('.suggestion');
  await expect(card).toBeVisible();

  // Hover for longer than the 6 s linger: still there.
  await card.hover();
  await page.waitForTimeout(7000);
  await expect(card).toBeVisible();

  // Leave: it goes within the linger.
  await page.mouse.move(0, 0);
  await expect(card).toHaveCount(0, { timeout: 8000 });

  // Recent words, with the accepted one marked.
  server.send({
    type: 'guess.offered',
    id: 'o2',
    latencyMs: 5,
    candidates: [{ word: 'whisk', confidence: 0.9 }],
  });
  server.send({ type: 'guess.accepted', id: 'o2', word: 'whisk', afterMs: 100 });
  await page.getByRole('button', { name: /^Meeting prep/ }).click();
  const recent = page.getByRole('group', { name: 'Recent words' });
  await expect(recent.getByRole('listitem')).toHaveText(['whisk (accepted)', 'renewal', 'chemist']);
});
