import { expect, test, type Page } from '@playwright/test';
import { installFakeSpeech, say } from './fakeSpeech';
import { offer, open } from './helpers';

// A microphone that plays a loud tone while `tone(true)` and silence otherwise.
async function installToneMic(page: Page) {
  await page.addInitScript(() => {
    const gains: GainNode[] = [];
    navigator.mediaDevices.getUserMedia = async () => {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const dest = ctx.createMediaStreamDestination();
      osc.connect(gain).connect(dest);
      osc.start();
      gains.push(gain);
      return dest.stream;
    };
    (window as unknown as Record<string, unknown>).tone = (on: boolean) =>
      gains.forEach((g) => (g.gain.value = on ? 0.5 : 0));
  });
}
const tone = (page: Page, on: boolean) =>
  page.evaluate((v) => (window as unknown as { tone(on: boolean): void }).tone(v), on);

type Sent = { type: string; voiced?: boolean; atMs?: number };
// Plays the server: records what the page sends as JSON.
async function fakeServer(page: Page) {
  const sent: Sent[] = [];
  await page.routeWebSocket('**/ws', (ws) =>
    ws.onMessage((m) => {
      if (typeof m === 'string') sent.push(JSON.parse(m) as Sent);
    }),
  );
  return sent;
}
const count = (sent: Sent[], type: string) => sent.filter((e) => e.type === type).length;

const start = (page: Page) => page.getByRole('button', { name: 'Start listening' }).click();

test('sends voice.activity only when sound starts and stops, back-dated to the change', async ({
  page,
}) => {
  await installToneMic(page);
  await installFakeSpeech(page);
  const sent = await fakeServer(page);
  await page.goto('/?debug=1');
  await start(page);
  await page.waitForTimeout(600);
  expect(count(sent, 'voice.activity')).toBe(0); // silence is not an event

  const before = Date.now();
  await tone(page, true);
  await expect.poll(() => sent.find((e) => e.type === 'voice.activity')?.voiced).toBe(true);
  const onAt = sent.find((e) => e.type === 'voice.activity')?.atMs ?? 0;
  expect(onAt).toBeGreaterThanOrEqual(before - 100);
  expect(onAt).toBeLessThan(before + 600);

  await page.waitForTimeout(800);
  await tone(page, false);
  await expect.poll(() => count(sent, 'voice.activity')).toBe(2);
  expect(sent.filter((e) => e.type === 'voice.activity').map((e) => e.voiced)).toEqual([
    true,
    false,
  ]);
});

test('a short blip of sound is ignored', async ({ page }) => {
  await installToneMic(page);
  await installFakeSpeech(page);
  const sent = await fakeServer(page);
  await page.goto('/?debug=1');
  await start(page);
  await page.waitForTimeout(400);
  await tone(page, true);
  await page.waitForTimeout(60);
  await tone(page, false);
  await page.waitForTimeout(800);
  expect(count(sent, 'voice.activity')).toBe(0);
});

test('pausing while sound is going on tells the server it stopped', async ({ page }) => {
  await installToneMic(page);
  await installFakeSpeech(page);
  const sent = await fakeServer(page);
  await page.goto('/?debug=1');
  await start(page);
  await page.waitForTimeout(400);
  await tone(page, true);
  await expect.poll(() => count(sent, 'voice.activity')).toBe(1);
  await page.getByRole('button', { name: 'Pause listening' }).click();
  await expect.poll(() => count(sent, 'voice.activity')).toBe(2);
  expect(sent.filter((e) => e.type === 'voice.activity').at(-1)?.voiced).toBe(false);
});

test('Space asks for a word, but not inside a text field or when not listening', async ({
  page,
}) => {
  await installToneMic(page);
  await installFakeSpeech(page);
  const sent = await fakeServer(page);
  await page.goto('/?debug=1');

  await page.locator('body').press('Space');
  expect(count(sent, 'stuck.manual')).toBe(0); // not listening yet

  await start(page);
  await page.getByLabel('Agenda, names, product or client terms').press('Space');
  await page.getByLabel(/Type a phrase/).press('Space');
  expect(count(sent, 'stuck.manual')).toBe(0);

  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Space');
  await expect.poll(() => count(sent, 'stuck.manual')).toBe(1);
});

test('Space gives a suggestion at once, with no pause, through the real server', async ({
  page,
}) => {
  await installToneMic(page);
  await installFakeSpeech(page);
  await open(page);
  await start(page);
  await say(page, [['the place where you get medicine', false]]);
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Space');
  await expect(offer(page)).toContainText('pharmacy', { timeout: 1200 });
});

test('saying "what\'s the word for" gives a suggestion at once', async ({ page }) => {
  await installToneMic(page);
  await installFakeSpeech(page);
  await open(page);
  await start(page);
  await say(page, [["we need the place where you get medicine what's the word for", false]]);
  await expect(offer(page)).toContainText('pharmacy', { timeout: 1200 });
});
