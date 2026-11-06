import { expect, test } from '@playwright/test';
import { offer, offerEverSeen, open, say, watchOffers } from './helpers';

test('a 4 s wait setting holds back an offer that would otherwise appear', async ({ page }) => {
  await open(page);
  await watchOffers(page);
  await page.getByLabel(/Wait before suggesting/).fill('4');
  await say(page, 'I need to go to the the place where you get medicine');
  // Typing takes 3.3 s; with the default wait the offer shows about 1 s after that.
  await page.waitForTimeout(3300 + 1500);
  expect(await offerEverSeen(page)).toBe(false);
  // It still comes once the longer wait has passed.
  await expect(offer(page)).toContainText('pharmacy', { timeout: 5000 });
});

test('the wait setting is remembered after a reload', async ({ page }) => {
  await open(page);
  await page.getByLabel(/Wait before suggesting/).fill('3');
  await page.reload();
  await expect(page.getByText('Wait before suggesting: 3.0 s')).toBeVisible();
});
