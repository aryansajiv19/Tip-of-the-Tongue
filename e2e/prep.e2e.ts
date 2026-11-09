import { expect, test, type Page } from '@playwright/test';
import { installFakeSpeech } from './fakeSpeech';
import { open, say } from './helpers';
import { tinyPdf } from './pdf';

const BRIEF = 'Q3 review with Northwind Analytics. Renewal of the SOC 2 licence.';

const prepButton = (page: Page) => page.getByRole('button', { name: /^Meeting prep/ });
const drawer = (page: Page) => page.getByRole('region', { name: 'Meeting prep' });
const terms = (page: Page) => drawer(page).getByRole('list', { name: 'Key terms' });
const pill = (page: Page) => page.getByRole('group', { name: 'Listening controls' });
const fileInput = (page: Page) => page.getByLabel('Meeting document');

async function openDrawer(page: Page) {
  await open(page);
  await prepButton(page).click();
  await expect(drawer(page)).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await installFakeSpeech(page);
});

test('the drawer is closed until opened from the pill, and Escape closes it', async ({ page }) => {
  await open(page);
  await expect(drawer(page)).toHaveCount(0);
  await expect(prepButton(page)).toHaveAttribute('aria-expanded', 'false');

  await prepButton(page).click();
  await expect(prepButton(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(drawer(page)).toContainText('Drop a PDF, .md or .txt file');
  await expect(drawer(page).getByRole('button', { name: 'Choose file' })).toBeVisible();

  await drawer(page).getByRole('button', { name: 'Choose file' }).focus();
  await page.keyboard.press('Escape');
  await expect(drawer(page)).toHaveCount(0);
  await expect(prepButton(page)).toHaveAttribute('aria-expanded', 'false');
});

test('it can be opened with the keyboard, right after the listening button', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Tab');
  await expect(pill(page).getByRole('button', { name: /listening/i })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(prepButton(page)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(drawer(page)).toBeVisible();
});

test('a text file becomes the brief: its name, key terms and the Meeting mode show', async ({
  page,
}) => {
  await openDrawer(page);
  await expect(pill(page)).toContainText('Meeting notes');
  await fileInput(page).setInputFiles({
    name: 'agenda.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from(BRIEF),
  });
  await expect(drawer(page)).toContainText('agenda.md');
  await expect(
    terms(page).getByRole('listitem').filter({ hasText: 'Northwind Analytics' }),
  ).toBeVisible();
  await expect(terms(page)).toContainText('SOC 2');
  await expect(terms(page)).toContainText('Q3');
  await expect(pill(page)).toContainText('Meeting');

  // Closing and reopening keeps it.
  await prepButton(page).click();
  await prepButton(page).click();
  await expect(drawer(page)).toContainText('agenda.md');
  await expect(terms(page)).toContainText('Northwind Analytics');
});

test('a PDF is read in the browser and becomes the brief', async ({ page }) => {
  await openDrawer(page);
  await fileInput(page).setInputFiles({
    name: 'review.pdf',
    mimeType: 'application/pdf',
    buffer: tinyPdf(['Q3 review with Northwind Analytics.', 'Renewal of the SOC 2 licence.']),
  });
  await expect(drawer(page)).toContainText('review.pdf');
  await expect(terms(page)).toContainText('Northwind Analytics');
  await expect(pill(page)).toContainText('Meeting');
});

test('a file dropped on the drop zone works too', async ({ page }) => {
  await openDrawer(page);
  const dataTransfer = await page.evaluateHandle((text) => {
    const dt = new DataTransfer();
    dt.items.add(new File([text], 'dropped.txt', { type: 'text/plain' }));
    return dt;
  }, BRIEF);
  const zone = drawer(page).locator('.prep-drop');
  await zone.dispatchEvent('dragover', { dataTransfer });
  await expect(zone).toHaveClass(/prep-drop-over/);
  await zone.dispatchEvent('drop', { dataTransfer });
  await expect(drawer(page)).toContainText('dropped.txt');
  await expect(zone).not.toHaveClass(/prep-drop-over/);
  await expect(terms(page)).toContainText('Northwind Analytics');
});

test('removing the document clears the brief, the terms and the mode', async ({ page }) => {
  await openDrawer(page);
  await fileInput(page).setInputFiles({
    name: 'agenda.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from(BRIEF),
  });
  await expect(pill(page)).toContainText('Meeting');
  await drawer(page).getByRole('button', { name: 'Remove agenda.md' }).click();
  await expect(drawer(page)).not.toContainText('agenda.md');
  await expect(terms(page)).toHaveCount(0);
  await expect(pill(page)).toContainText('Meeting notes');
});

test('a file of the wrong kind, an empty file and a broken PDF each say what is wrong', async ({
  page,
}) => {
  await openDrawer(page);
  const alert = page.getByRole('alert');
  await fileInput(page).setInputFiles({
    name: 'slides.pptx',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('x'),
  });
  await expect(alert).toContainText('Only PDF, .md and .txt');

  await fileInput(page).setInputFiles({
    name: 'empty.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('  '),
  });
  await expect(alert).toContainText('No text found');

  await fileInput(page).setInputFiles({
    name: 'bad.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('this is not a pdf'),
  });
  await expect(alert).toContainText('Could not read');
  // Nothing was loaded, and the page still works.
  await expect(pill(page)).toContainText('Meeting notes');
  await expect(drawer(page).getByRole('button', { name: 'Choose file' })).toBeVisible();
});

test('a long file is cut to 50,000 characters and says so', async ({ page }) => {
  await openDrawer(page);
  await fileInput(page).setInputFiles({
    name: 'long.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Northwind '.repeat(8000)),
  });
  await expect(drawer(page)).toContainText('Using the first 50,000 characters');
  await expect(drawer(page)).toContainText('long.txt');
});

test('a suggestion from the document names it as the source', async ({ page }) => {
  const offered: { candidates: { word: string; source?: string }[] }[] = [];
  page.on('websocket', (ws) =>
    ws.on('framereceived', (f) => {
      if (typeof f.payload !== 'string') return;
      const e = JSON.parse(f.payload) as { type: string; candidates?: never };
      if (e.type === 'guess.offered') offered.push(e as never);
    }),
  );
  await openDrawer(page);
  await fileInput(page).setInputFiles({
    name: 'errands.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Errands for Friday: the pharmacy opens at nine.'),
  });
  await expect(pill(page)).toContainText('Meeting');
  await say(page, 'I need to go to the the place where you get medicine');
  await expect.poll(() => offered.length, { timeout: 10_000 }).toBeGreaterThan(0);
  const words = offered[0]?.candidates ?? [];
  expect(words.find((c) => c.word === 'pharmacy')?.source).toBe('errands.txt');
  expect(words.find((c) => c.word === 'chemist')?.source).toBeUndefined();
});
