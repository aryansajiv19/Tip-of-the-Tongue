import { expect, test, type Page } from '@playwright/test';
import { offer, open, say } from './helpers';

const PHRASE = 'I need to go to the the place where you get medicine';
// Typing takes 3.3 s, then the server needs a pause and a guess.
const OFFER_WITHIN_MS = 3300 + 3000;

async function showOffer(page: Page) {
  await open(page);
  await say(page, PHRASE);
  await expect(offer(page)).toContainText('pharmacy', { timeout: OFFER_WITHIN_MS });
}

test('the words are large buttons, best first', async ({ page }) => {
  await showOffer(page);
  const words = offer(page).getByRole('button').filter({ hasNotText: /^$/ });
  await expect(words.first()).toHaveText('pharmacy');
  const size = await words.first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(size).toBeGreaterThanOrEqual(28);
});

test('clicking a word shows the accepted state, then it fades away', async ({ page }) => {
  await showOffer(page);
  await offer(page).getByRole('button', { name: 'chemist' }).click();
  await expect(offer(page)).toContainText('Got it: chemist');
  await expect(offer(page)).toHaveText('', { timeout: 3000 });
});

test('Escape dismisses the pop-up', async ({ page }) => {
  await showOffer(page);
  await page.keyboard.press('Escape');
  await expect(offer(page)).toHaveText('');
});

test('the close button dismisses it', async ({ page }) => {
  await showOffer(page);
  await offer(page).getByRole('button', { name: 'Dismiss' }).click();
  await expect(offer(page)).toHaveText('');
});

test('the card sits under the control pill at the top right', async ({ page }) => {
  await showOffer(page);
  const card = await offer(page).locator('section').boundingBox();
  const pill = await page.getByRole('group', { name: 'Listening controls' }).boundingBox();
  const view = page.viewportSize();
  expect(card && pill && view).toBeTruthy();
  if (!card || !pill || !view) return;
  expect(pill.x + pill.width).toBeCloseTo(view.width - 16, 0);
  expect(card.y).toBeGreaterThanOrEqual(pill.y + pill.height);
  expect(card.x + card.width).toBeCloseTo(view.width - 16, 0);
});

test('with reduced transparency the card is solid, with no blur', async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }],
  });
  await showOffer(page);
  const style = await offer(page)
    .locator('section')
    .evaluate((el) => {
      const s = getComputedStyle(el);
      return { bg: s.backgroundColor, blur: s.backdropFilter };
    });
  expect(style.bg).toBe('rgb(16, 20, 31)');
  expect(style.blur).toBe('none');
});

test('with reduced motion there is no animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await showOffer(page);
  const name = await offer(page)
    .locator('section')
    .evaluate((el) => getComputedStyle(el).animationName);
  expect(name).toBe('none');
});
