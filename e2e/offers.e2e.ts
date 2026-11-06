import { expect, test } from '@playwright/test';
import { offer, offerEverSeen, open, say, watchOffers } from './helpers';

// Typing 11 words takes 3.3 s, then the server needs a pause and a guess: allow 3 s more.
const OFFER_WITHIN_MS = 3300 + 3000;

test('a described word gets an offer, saying it accepts it, then it clears', async ({ page }) => {
  await open(page);
  await say(page, 'I need to go to the the place where you get medicine');
  await expect(offer(page)).toContainText('pharmacy', { timeout: OFFER_WITHIN_MS });
  await expect(offer(page)).toContainText("Is this the word you're looking for?");

  await say(page, 'pharmacy');
  await expect(offer(page)).toContainText('Got it: pharmacy');
  await expect(offer(page)).toHaveText('');
});

test('fluent speech gets no offer', async ({ page }) => {
  await open(page);
  await watchOffers(page);
  await say(page, 'we reviewed the budget and agreed to meet again on Thursday');
  await page.waitForTimeout(5000);
  expect(await offerEverSeen(page)).toBe(false);
  await expect(offer(page)).toHaveText('');
});

test('finding the word yourself leaves no offer', async ({ page }) => {
  await open(page);
  await say(page, 'can you pass the the thing for cutting bread knife');
  await page.waitForTimeout(6000);
  // Either never shown or withdrawn: nothing may be on screen.
  await expect(offer(page)).toHaveText('');
});
