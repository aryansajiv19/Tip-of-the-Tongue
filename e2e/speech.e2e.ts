import { expect, test, type Page } from '@playwright/test';
import { offer, open } from './helpers';

// A fake SpeechRecognition the test can drive. Each start() makes a new instance.
async function installFakeSpeech(page: Page) {
  await page.addInitScript(() => {
    interface Fake {
      onstart?: () => void;
      onresult?: ((e: unknown) => void) | null;
      onend?: () => void;
      stopped: boolean;
    }
    const instances: Fake[] = [];
    class FakeRecognition {
      stopped = false;
      onstart?: () => void;
      onresult?: ((e: unknown) => void) | null;
      onend?: () => void;
      start() {
        instances.push(this);
        setTimeout(() => this.onstart?.(), 0);
      }
      stop() {
        this.stopped = true;
        setTimeout(() => this.onend?.(), 0);
      }
    }
    const last = () => instances.filter((i) => !i.stopped).at(-1);
    (window as unknown as Record<string, unknown>).fakeSpeech = {
      count: () => instances.length,
      // Like Chrome: `results` is the whole list, one entry per chunk.
      say: (chunks: [string, boolean][]) =>
        last()?.onresult?.({
          resultIndex: 0,
          results: chunks.map(([transcript, isFinal]) => ({ isFinal, 0: { transcript } })),
        }),
      end: () => last()?.onend?.(),
    };
    Object.defineProperty(window, 'SpeechRecognition', { value: FakeRecognition });
  });
}

type Chunks = [string, boolean][];
const say = (page: Page, chunks: Chunks) =>
  page.evaluate(
    (c) => (window as unknown as { fakeSpeech: { say(c: Chunks): void } }).fakeSpeech.say(c),
    chunks,
  );
const endRecognition = (page: Page) =>
  page.evaluate(() => (window as unknown as { fakeSpeech: { end(): void } }).fakeSpeech.end());
const instanceCount = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { fakeSpeech: { count(): number } }).fakeSpeech.count(),
  );

// Everything the page sends over /ws, parsed.
function recordSent(page: Page) {
  const sent: { type: string; words?: { text: string; startMs: number }[] }[] = [];
  page.on('websocket', (ws) =>
    ws.on('framesent', (f) => sent.push(JSON.parse(String(f.payload)) as (typeof sent)[number])),
  );
  return sent;
}

const start = (page: Page) => page.getByRole('button', { name: 'Start listening' }).click();

test('chunked interim then final speech reaches the server and produces an offer', async ({
  page,
}) => {
  await installFakeSpeech(page);
  await open(page);
  await start(page);
  await say(page, [['I need to go to the', false]]);
  await say(page, [
    ['I need to go to the', true],
    [' the place where you', false],
  ]);
  await say(page, [
    ['I need to go to the', true],
    [' the place where you get medicine', false],
  ]);
  await expect(offer(page)).toContainText('pharmacy', { timeout: 6000 });
  await say(page, [
    ['I need to go to the', true],
    [' the place where you get medicine', true],
  ]);
  await expect(page.getByRole('region', { name: 'Transcript' })).toContainText(
    'I need to go to the the place where you get medicine',
  );
});

test('per-word finals make one paragraph and the server gets each word once, in order', async ({
  page,
}) => {
  await installFakeSpeech(page);
  const sent = recordSent(page);
  await open(page);
  await start(page);
  const words = 'we need to sort out the renewal'.split(' ');
  for (let k = 1; k <= words.length; k++) {
    await say(
      page,
      words.slice(0, k).map((w, n): [string, boolean] => [(n ? ' ' : '') + w, true]),
    );
  }
  const finals = sent.filter((e) => e.type === 'transcript.final').flatMap((e) => e.words ?? []);
  expect(finals.map((w) => w.text)).toEqual(words);
  const times = finals.map((w) => w.startMs);
  expect(times).toEqual([...times].sort((a, b) => a - b));
  const transcript = page.getByRole('region', { name: 'Transcript' });
  await expect(transcript).toContainText('we need to sort out the renewal');
  await expect(transcript.getByRole('listitem')).toHaveCount(0);
});

test('recognition ending without a final still sends the words, with their old times', async ({
  page,
}) => {
  await installFakeSpeech(page);
  const sent = recordSent(page);
  await open(page);
  await start(page);
  await say(page, [
    ['the thing', true],
    [' for', false],
  ]);
  await page.waitForTimeout(300);
  await endRecognition(page);
  await expect.poll(() => sent.filter((e) => e.type === 'transcript.final').length).toBe(2);
  const finals = sent.filter((e) => e.type === 'transcript.final').flatMap((e) => e.words ?? []);
  expect(finals.map((w) => w.text)).toEqual(['the', 'thing', 'for']);
  const partialFor = sent
    .filter((e) => e.type === 'transcript.partial')
    .flatMap((e) => e.words ?? [])
    .find((w) => w.text === 'for');
  expect(finals[2]?.startMs).toBe(partialFor?.startMs);
});

test('watchdog restarts recognition after 20 s of silence', async ({ page }) => {
  await installFakeSpeech(page);
  await page.clock.install();
  await open(page);
  await start(page);
  expect(await instanceCount(page)).toBe(1);
  await page.clock.fastForward(25_000);
  await expect.poll(() => instanceCount(page)).toBe(2);
});

test('shows "Listening paused" while the socket is down', async ({ page }) => {
  await installFakeSpeech(page);
  await page.routeWebSocket('**/ws', (ws) => void ws.close());
  await page.goto('/');
  await start(page);
  await expect(page.getByText('Listening paused')).toBeVisible();
});

test('recognition resumes when the tab becomes visible again', async ({ page }) => {
  await installFakeSpeech(page);
  const sent = recordSent(page);
  await open(page);
  await start(page);
  await say(page, [['hello there', false]]);
  const setVisibility = (state: 'hidden' | 'visible') =>
    page.evaluate((s) => {
      Object.defineProperty(document, 'visibilityState', { value: s, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    }, state);
  await setVisibility('hidden');
  await expect.poll(() => sent.some((e) => e.type === 'transcript.final')).toBe(true);
  await setVisibility('visible');
  await expect.poll(() => instanceCount(page)).toBe(2);
});
