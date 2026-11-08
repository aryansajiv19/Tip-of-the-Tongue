import { expect, type Page } from '@playwright/test';

export const offer = (page: Page) => page.getByLabel('Word suggestions');

// Type a phrase into the developer tools' input (no mic) and send it.
export async function say(page: Page, phrase: string) {
  await page.getByLabel(/Type a phrase/).fill(phrase);
  await page.getByRole('button', { name: 'Send as speech' }).click();
}

export async function open(page: Page) {
  await page.goto('/?debug=1');
  await expect(page.getByRole('status').first()).toHaveText('Server: connected');
}

// Remember if an offer was ever shown, even briefly.
export async function watchOffers(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { offerSeen: boolean };
    w.offerSeen = false;
    new MutationObserver(() => {
      if (document.querySelector('aside')?.textContent?.includes('word you')) w.offerSeen = true;
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
}

export const offerEverSeen = (page: Page) =>
  page.evaluate(() => (window as unknown as { offerSeen: boolean }).offerSeen);
