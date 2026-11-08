import { expect, test, type Page } from '@playwright/test';
import { installFakeSpeech } from './fakeSpeech';
import { open } from './helpers';

// Chrome would otherwise keep the fake microphone's AudioContext suspended.
test.use({ launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } });

// A microphone whose loudness the test sets: a steady tone through a gain node.
async function installFakeMic(page: Page) {
  await page.addInitScript(() => {
    const ctx = new AudioContext();
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const osc = ctx.createOscillator();
    osc.frequency.value = 220;
    const dest = ctx.createMediaStreamDestination();
    osc.connect(gain).connect(dest);
    osc.start();
    (window as unknown as { setMicGain(v: number): void }).setMicGain = (v) => {
      gain.gain.value = v;
    };
    navigator.mediaDevices.getUserMedia = () => Promise.resolve(dest.stream);
  });
}

const pill = (page: Page) => page.getByRole('group', { name: 'Listening controls' });
const toggle = (page: Page) => pill(page).getByRole('button', { name: /listening/i });
const timer = (page: Page) => pill(page).getByRole('timer', { name: 'Time listening' });
const setMicGain = (page: Page, v: number) =>
  page.evaluate((g) => (window as unknown as { setMicGain(v: number): void }).setMicGain(g), v);

// How tall each bar is, as a share of the full height.
const barScales = (page: Page) =>
  pill(page)
    .locator('.pill-bar')
    .evaluateAll((bars) => bars.map((b) => new DOMMatrix(getComputedStyle(b).transform).d));

test.beforeEach(async ({ page }) => {
  await installFakeSpeech(page);
  await installFakeMic(page);
});

test('the pill is 340 by 44 and shows its parts at the top right', async ({ page }) => {
  await open(page);
  const box = await pill(page).boundingBox();
  const view = page.viewportSize();
  expect(box && view).toBeTruthy();
  if (!box || !view) return;
  expect(box.width).toBe(340);
  expect(box.height).toBe(44);
  expect(box.x + box.width).toBeCloseTo(view.width - 16, 0);
  expect(box.y).toBeCloseTo(16, 0);

  await expect(toggle(page)).toHaveAccessibleName('Start listening');
  await expect(timer(page)).toHaveText('00:00');
  await expect(pill(page)).toContainText('Everyday');
  await expect(pill(page).getByRole('button', { name: 'New conversation' })).toBeVisible();
  const mod = await page.evaluate(() => (/mac/i.test(navigator.platform) ? '⌘' : 'Ctrl'));
  await expect(pill(page).locator('.keycap')).toHaveText([`${mod}\\`, `${mod}↵`]);
});

test('the waveform follows the microphone while listening and rests when paused', async ({
  page,
}) => {
  await open(page);
  expect(Math.max(...(await barScales(page)))).toBeCloseTo(0.14, 1);
  await expect(pill(page).getByRole('img', { name: 'Microphone is off' })).toBeVisible();

  await toggle(page).click();
  await expect(pill(page).getByRole('img', { name: 'Microphone is on' })).toBeVisible();
  await setMicGain(page, 0);
  await expect.poll(async () => (await barScales(page))[2]).toBeLessThan(0.3);

  await setMicGain(page, 0.5);
  await expect.poll(async () => (await barScales(page))[2]).toBeGreaterThan(0.8);
  const loud = await barScales(page);
  // Middle bar tallest, edges shortest.
  expect(loud[2]).toBeGreaterThanOrEqual(loud[1] as number);
  expect(loud[1]).toBeGreaterThan(loud[0] as number);

  await toggle(page).click(); // Pause
  await expect.poll(async () => Math.max(...(await barScales(page)))).toBeLessThan(0.3);
});

test('the bars are accent-coloured while listening and faint while paused', async ({ page }) => {
  await open(page);
  const colour = () =>
    pill(page)
      .locator('.pill-bar')
      .first()
      .evaluate((b) => getComputedStyle(b).backgroundColor);
  const paused = await colour();
  await toggle(page).click();
  await expect.poll(colour).not.toBe(paused);
  expect(await colour()).toBe('rgb(125, 211, 252)'); // --accent
  expect(paused).toBe('rgb(107, 107, 115)'); // --text-faint
});

test('the timer counts while listening, stops on pause and restarts on a new conversation', async ({
  page,
}) => {
  await open(page);
  await page.clock.install();
  await toggle(page).click();
  await expect(toggle(page)).toHaveAccessibleName('Pause listening');
  await page.clock.runFor(3500);
  await expect(timer(page)).toHaveText('00:03');

  await toggle(page).click();
  await page.clock.runFor(10_000);
  await expect(timer(page)).toHaveText('00:03');

  await toggle(page).click();
  await page.clock.runFor(2000);
  await expect(timer(page)).toHaveText('00:05');

  await pill(page).getByRole('button', { name: 'New conversation' }).click();
  await expect(timer(page)).toHaveText('00:00');
  await page.clock.runFor(1500);
  await expect(timer(page)).toHaveText('00:01');
});

test('the mode is Meeting once a brief is loaded', async ({ page }) => {
  await open(page);
  await expect(pill(page)).toContainText('Everyday');
  await page.getByLabel(/Meeting brief/).fill('Q3 review with Northwind');
  await page.getByRole('button', { name: 'Use this brief' }).click();
  await expect(pill(page)).toContainText('Meeting');
});

test('keyboard focus goes to the listening button, then New conversation', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Tab');
  await expect(toggle(page)).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(pill(page).getByRole('button', { name: 'New conversation' })).toBeFocused();
  // Space on the focused button works like a click.
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Space');
  await expect(toggle(page)).toHaveAccessibleName('Pause listening');
});

test('the focus ring is drawn on the focused button', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Tab');
  const ring = await toggle(page).evaluate((b) => getComputedStyle(b).boxShadow);
  expect(ring).toContain('rgb(125, 211, 252)');
});

test('Ctrl+\\ hides and shows the overlay, Ctrl+Enter asks for a word while listening', async ({
  page,
}) => {
  const sent: string[] = [];
  page.on('websocket', (ws) =>
    ws.on('framesent', (f) => {
      if (typeof f.payload === 'string')
        sent.push((JSON.parse(f.payload) as { type: string }).type);
    }),
  );
  await open(page);

  // Not listening yet: nothing to ask.
  await page.keyboard.press('Control+Enter');
  await toggle(page).click();
  await page.keyboard.press('Control+Enter');
  await expect.poll(() => sent.filter((t) => t === 'stuck.manual').length).toBe(1);

  await page.keyboard.press('Control+Backslash');
  await expect(pill(page)).toHaveCount(0);
  await page.keyboard.press('Control+Backslash');
  await expect(pill(page)).toBeVisible();
});

test('without speech recognition the button is disabled and says so', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'SpeechRecognition', { value: undefined });
    Object.defineProperty(window, 'webkitSpeechRecognition', { value: undefined });
  });
  await open(page);
  await expect(pill(page).getByRole('button', { name: 'Listening unavailable' })).toBeDisabled();
  await expect(page.getByRole('alert')).toContainText('no speech recognition');
});
