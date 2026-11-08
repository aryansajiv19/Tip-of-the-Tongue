import { expect, test, type Page } from '@playwright/test';
import { installFakeSpeech, instanceCount } from './fakeSpeech';

// A microphone that plays a tone, so no real device or permission prompt is needed.
async function installFakeMic(page: Page) {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const dest = ctx.createMediaStreamDestination();
      osc.connect(dest);
      osc.start();
      return dest.stream;
    };
  });
}

// Plays the server: the test, not the real server, answers on /ws and counts audio frames.
async function fakeServer(page: Page) {
  const audio: number[] = [];
  const server: { say: (event: object) => void } = { say: () => undefined };
  await page.routeWebSocket('**/ws', (ws) => {
    server.say = (event) => ws.send(JSON.stringify(event));
    ws.onMessage((m) => {
      if (typeof m !== 'string') audio.push(m.length);
    });
  });
  return { audio, server };
}

const status = (page: Page) => page.getByRole('status').first();

test('streams 100 ms PCM chunks as binary frames when the server does the recognition', async ({
  page,
}) => {
  await installFakeMic(page);
  await installFakeSpeech(page);
  const { audio, server } = await fakeServer(page);
  await page.goto('/?debug=1');
  await expect(status(page)).toHaveText('Server: connected');
  server.say({ type: 'session.ready', stt: 'deepgram' });

  await page.getByRole('button', { name: 'Start listening' }).click();
  await expect.poll(() => audio.length, { timeout: 5000 }).toBeGreaterThan(3);
  expect(audio.every((n) => n === 3200)).toBe(true); // 1600 samples x 2 bytes
  expect(await instanceCount(page)).toBe(0); // Web Speech is not used

  server.say({
    type: 'transcript.final',
    words: [{ text: 'hello', startMs: 1, endMs: 2 }],
  });
  server.say({ type: 'transcript.partial', words: [{ text: 'there', startMs: 3, endMs: 4 }] });
  await expect(page.getByRole('region', { name: 'Transcript' })).toContainText('hello there');

  await page.getByRole('button', { name: 'Pause listening' }).click();
  await page.waitForTimeout(300);
  const after = audio.length;
  await page.waitForTimeout(500);
  expect(audio.length).toBe(after); // capture stopped
});

test('falls back to browser speech with a calm notice when the server switches', async ({
  page,
}) => {
  await installFakeMic(page);
  await installFakeSpeech(page);
  const { audio, server } = await fakeServer(page);
  await page.goto('/?debug=1');
  await expect(status(page)).toHaveText('Server: connected');
  server.say({ type: 'session.ready', stt: 'deepgram' });
  await page.getByRole('button', { name: 'Start listening' }).click();
  await expect.poll(() => audio.length, { timeout: 5000 }).toBeGreaterThan(0);

  server.say({ type: 'session.ready', stt: 'browser' });
  await expect(page.getByText('Switched to this browser')).toBeVisible();
  await expect.poll(() => instanceCount(page)).toBe(1);
  await page.waitForTimeout(300);
  const after = audio.length;
  await page.waitForTimeout(500);
  expect(audio.length).toBe(after);
});

test('shows the microphone-blocked message when capture is refused', async ({ page }) => {
  await installFakeSpeech(page);
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () =>
      Promise.reject(new DOMException('no', 'NotAllowedError'));
  });
  const { server } = await fakeServer(page);
  await page.goto('/?debug=1');
  await expect(status(page)).toHaveText('Server: connected');
  server.say({ type: 'session.ready', stt: 'deepgram' });
  await page.getByRole('button', { name: 'Start listening' }).click();
  await expect(page.getByRole('alert')).toContainText('Microphone access was blocked');
});
