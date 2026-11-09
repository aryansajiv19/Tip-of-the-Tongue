import { expect, test, type Page } from '@playwright/test';
import { failRecognition, installFakeSpeech, instanceCount } from './fakeSpeech';

// Things that go wrong with real microphones, networks and hands, driven in a real browser.

interface MicOptions {
  rate?: number;
  // 0 plays digital silence, as a microphone muted by the OS does.
  gain?: number;
}

// A microphone that plays a tone at the given sample rate, and can be unplugged. Every stream and
// audio context is recorded so the test can see what is still open.
async function installFakeMic(page: Page, { rate = 48000, gain = 0.3 }: MicOptions = {}) {
  await page.addInitScript(
    ([sampleRate, level]) => {
      const w = window as unknown as {
        streams: MediaStream[];
        contexts: AudioContext[];
        micGone: boolean;
        gumCalls: number;
      };
      w.streams = [];
      w.contexts = [];
      w.micGone = false;
      w.gumCalls = 0;
      const Real = window.AudioContext;
      window.AudioContext = class extends Real {
        constructor(options?: AudioContextOptions) {
          super(options);
          w.contexts.push(this);
        }
      };
      navigator.mediaDevices.getUserMedia = async () => {
        w.gumCalls++;
        if (w.micGone) throw new DOMException('Requested device not found', 'NotFoundError');
        const ctx = new Real({ sampleRate });
        const osc = ctx.createOscillator();
        const amp = ctx.createGain();
        amp.gain.value = level ?? 0.3;
        const dest = ctx.createMediaStreamDestination();
        osc.connect(amp).connect(dest);
        osc.start();
        w.streams.push(dest.stream);
        return dest.stream;
      };
    },
    [rate, gain] as const,
  );
}

async function fakeServer(page: Page) {
  // Frame sizes in bytes; `loud` keeps whether each frame had any sound in it.
  const audio: number[] = [];
  const loud: boolean[] = [];
  const server: { say: (event: object) => void } = { say: () => undefined };
  await page.routeWebSocket('**/ws', (ws) => {
    server.say = (event) => ws.send(JSON.stringify(event));
    ws.onMessage((m) => {
      if (typeof m === 'string') return;
      audio.push(m.length);
      loud.push(m.some((b) => b !== 0));
    });
  });
  return { audio, loud, server };
}

const status = (page: Page) => page.getByRole('status').first();
const start = (page: Page) => page.getByRole('button', { name: 'Start listening' });
const pause = (page: Page) => page.getByRole('button', { name: 'Pause listening' });

async function listening(page: Page, options?: MicOptions) {
  await installFakeMic(page, options);
  await installFakeSpeech(page);
  const fake = await fakeServer(page);
  await page.goto('/?debug=1');
  await expect(status(page)).toHaveText('Connected');
  fake.server.say({ type: 'session.ready', stt: 'deepgram' });
  await start(page).click();
  await expect.poll(() => fake.audio.length, { timeout: 5000 }).toBeGreaterThan(3);
  return fake;
}

const liveTracks = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { streams: MediaStream[] }).streams
        .flatMap((s) => s.getTracks())
        .filter((t) => t.readyState === 'live').length,
  );

test.describe('microphones at other sample rates', () => {
  for (const rate of [8000, 44100, 48000]) {
    test(`a ${rate} Hz microphone still arrives as 100 ms chunks of 16 kHz audio`, async ({
      page,
    }) => {
      const { audio } = await listening(page, { rate });
      const before = audio.length;
      await page.waitForTimeout(2000);
      const frames = audio.slice(before);
      // Ten a second; a wrong rate would make them come twice as fast or as slow.
      expect(frames.length).toBeGreaterThan(15);
      expect(frames.length).toBeLessThan(25);
      expect(new Set(frames)).toEqual(new Set([3200]));
    });
  }
});

test.describe('the microphone goes away mid-call', () => {
  const unplug = (page: Page) =>
    page.evaluate(() => {
      const w = window as unknown as { streams: MediaStream[]; micGone: boolean };
      for (const track of w.streams.flatMap((s) => s.getTracks())) {
        track.stop();
        track.dispatchEvent(new Event('ended')); // stop() alone does not fire it
      }
    });

  test('switches to the default microphone and carries on without the user doing anything', async ({
    page,
  }) => {
    const { loud } = await listening(page);
    await page.waitForTimeout(3200); // a microphone that dies at once is not retried
    await unplug(page);
    const at = loud.length;
    // A dead microphone still sends frames, all of them silent. Sound has to come back.
    await expect
      .poll(() => loud.slice(at + 3).filter(Boolean).length, { timeout: 5000 })
      .toBeGreaterThan(5);
    await expect(pause(page)).toBeVisible();
  });

  test('with no microphone left, stops and says so, instead of listening to nothing', async ({
    page,
  }) => {
    await listening(page);
    await page.evaluate(() => ((window as unknown as { micGone: boolean }).micGone = true));
    await unplug(page);
    await expect(start(page)).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('alert')).toContainText(/microphone/i);
  });
});

test('audio that the browser suspended (sleep, wake, a call elsewhere) is resumed', async ({
  page,
}) => {
  const { audio } = await listening(page);
  await page.evaluate(() =>
    Promise.all(
      (window as unknown as { contexts: AudioContext[] }).contexts.map((c) => c.suspend()),
    ),
  );
  await page.waitForTimeout(500);
  const at = audio.length;
  await expect.poll(() => audio.length, { timeout: 5000 }).toBeGreaterThan(at + 5);
});

test('a microphone that is muted at the OS says so after ten seconds', async ({ page }) => {
  test.setTimeout(60_000);
  await listening(page, { gain: 0 });
  const note = page.getByText(/can.t hear|muted/i);
  await expect(note).toHaveCount(0);
  await expect(note).toBeVisible({ timeout: 20_000 });
});

test('quiet speech that keeps arriving as words warns to speak up', async ({ page }) => {
  test.setTimeout(60_000);
  const { server } = await listening(page, { gain: 0.01 });
  const note = page.getByText(/very quiet/i);
  let n = 0;
  const talk = setInterval(
    () =>
      server.say({
        type: 'transcript.partial',
        words: [{ text: `word${n++}`, startMs: Date.now(), endMs: Date.now() + 100 }],
      }),
    1500,
  );
  await expect(note).toBeVisible({ timeout: 30_000 });
  clearInterval(talk);
});

test.describe('hands on the buttons', () => {
  test('a double-click on Start opens one microphone, not two', async ({ page }) => {
    await installFakeMic(page);
    await installFakeSpeech(page);
    const { audio, server } = await fakeServer(page);
    await page.goto('/?debug=1');
    await expect(status(page)).toHaveText('Connected');
    server.say({ type: 'session.ready', stt: 'deepgram' });
    await start(page).dblclick();
    await expect.poll(() => audio.length, { timeout: 5000 }).toBeGreaterThan(3);
    const before = audio.length;
    await page.waitForTimeout(1000);
    // One capture is ten frames a second; two would be twenty.
    expect(audio.length - before).toBeLessThan(14);
    await pause(page).click();
    await page.waitForTimeout(500);
    expect(await liveTracks(page)).toBe(0);
  });

  test('forty Start/Pause presses in a row leave nothing listening, nothing open', async ({
    page,
  }) => {
    const { audio } = await listening(page);
    // Listening now: Pause, Start, Pause, Start ... 40 presses, ending on Start.
    for (let i = 0; i < 40; i++) await (i % 2 === 0 ? pause(page) : start(page)).click();
    await pause(page).click(); // waits for the last Start to finish
    await expect(start(page)).toBeVisible();
    await page.waitForTimeout(700);
    const at = audio.length;
    await page.waitForTimeout(500);
    expect(audio.length).toBe(at);
    expect(await liveTracks(page)).toBe(0);
  });

  test('forty quick Start/Pause presses with browser speech leave at most one recogniser', async ({
    page,
  }) => {
    await installFakeSpeech(page);
    await page.goto('/?debug=1');
    await expect(status(page)).toHaveText('Connected');
    for (let i = 0; i < 40; i++) {
      await (i % 2 === 0 ? start(page) : pause(page)).click({ delay: 0 });
    }
    if (await pause(page).isVisible()) await pause(page).click();
    await expect(start(page)).toBeVisible();
    await page.waitForTimeout(600);
    const count = await instanceCount(page);
    await page.waitForTimeout(800);
    expect(await instanceCount(page)).toBe(count); // nothing restarts by itself
  });
});

test('in the desktop app, speech that cannot be reached says to add a Deepgram key', async ({
  page,
}) => {
  await page.addInitScript(() => {
    // What the Electron preload script exposes.
    (window as unknown as { tott: object }).tott = {
      onCommand: () => () => undefined,
      setHeight: () => undefined,
      captureCardKeys: () => () => undefined,
      report: () => undefined,
    };
  });
  await installFakeSpeech(page);
  await page.goto('/?debug=1');
  await expect(status(page)).toHaveText('Connected');
  await start(page).click();
  await failRecognition(page, 'network');
  await expect(page.getByRole('alert')).toContainText('Speech needs a Deepgram key');
  await expect(page.getByRole('alert')).not.toContainText('connection');
});

test('browser speech that cannot reach its service backs off instead of restarting four times a second', async ({
  page,
}) => {
  await installFakeSpeech(page);
  await page.goto('/?debug=1');
  await expect(status(page)).toHaveText('Connected');
  await start(page).click();
  // The service is unreachable: every session errors and ends at once.
  const stop = Date.now() + 4000;
  let seen = await instanceCount(page);
  while (Date.now() < stop) {
    await failRecognition(page, 'network');
    await page.evaluate(() =>
      (window as unknown as { fakeSpeech: { end(): void } }).fakeSpeech.end(),
    );
    await page.waitForTimeout(60);
    seen = await instanceCount(page);
  }
  expect(seen).toBeLessThanOrEqual(6);
  await expect(page.getByRole('alert')).toContainText(/connection|reach/i);
});
