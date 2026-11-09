import { expect, test, type Page } from '@playwright/test';
import { fakeServer, offered, stuck } from './fakeServer';
import { offer, open, say } from './helpers';

const status = (page: Page) => page.getByRole('status').first();
const newConversation = (page: Page) => page.getByRole('button', { name: 'New conversation' });
const transcript = (page: Page) => page.getByRole('region', { name: 'Transcript' });

test('New conversation clears the transcript and the card, and tells the server', async ({
  page,
}) => {
  const server = await fakeServer(page);
  await page.goto('/?debug=1');
  await expect(status(page)).toHaveText('Connected');
  server.send({ type: 'transcript.final', words: [{ text: 'hello', startMs: 1, endMs: 2 }] });
  server.send(offered('a', [['renewal', 0.9]]));
  await expect(transcript(page)).toContainText('hello');
  await expect(offer(page)).toContainText('renewal');

  await newConversation(page).click();
  await expect(transcript(page)).not.toContainText('hello');
  await expect(offer(page)).toHaveText('');
  await expect.poll(() => server.count('session.reset')).toBe(1);
});

test('anything the server sent before it confirmed the reset is ignored', async ({ page }) => {
  const server = await fakeServer(page);
  await page.goto('/?debug=1');
  await expect(status(page)).toHaveText('Connected');
  await newConversation(page).click();
  await expect.poll(() => server.count('session.reset')).toBe(1);

  // Still on their way from the old conversation:
  server.send(stuck);
  server.send(offered('old', [['pharmacy', 0.9]]));
  server.send({ type: 'transcript.final', words: [{ text: 'stale', startMs: 1, endMs: 2 }] });
  await page.waitForTimeout(400);
  await expect(offer(page)).toHaveText('');
  await expect(transcript(page)).not.toContainText('stale');

  // After the confirmation, new events show.
  server.send({ type: 'session.cleared' });
  server.send({ type: 'transcript.final', words: [{ text: 'fresh', startMs: 3, endMs: 4 }] });
  server.send(offered('new', [['renewal', 0.9]]));
  await expect(transcript(page)).toContainText('fresh');
  await expect(offer(page)).toContainText('renewal');
});

test('with the real server: reset mid-offer, the old suggestion never comes back, and a new one works', async ({
  page,
}) => {
  await open(page);
  await say(page, 'I need to go to the the place where you get medicine');
  await expect(offer(page)).toContainText('pharmacy', { timeout: 6300 });

  await newConversation(page).click();
  await expect(offer(page)).toHaveText('');
  await expect(transcript(page)).not.toContainText('medicine');

  // The same stall in the new conversation is offered at once (the cooldown was cleared).
  await say(page, 'okay I need to go to the the place where you get medicine');
  await expect(offer(page)).toContainText('pharmacy', { timeout: 6300 });
});

test('the brief is kept after a new conversation', async ({ page }) => {
  const server = await fakeServer(page);
  await page.goto('/?debug=1');
  await expect(status(page)).toHaveText('Connected');
  await page.getByLabel(/Meeting brief/).fill('Q3 review with Northwind');
  await page.getByRole('button', { name: 'Use this brief' }).click();
  await newConversation(page).click();
  await expect.poll(() => server.count('session.reset')).toBe(1);
  expect(server.sent.filter((e) => e.type === 'session.brief')).toHaveLength(1);
  // Nothing in the page asks the server to forget it.
  await expect(page.getByLabel(/Meeting brief/)).toHaveValue('Q3 review with Northwind');
});
