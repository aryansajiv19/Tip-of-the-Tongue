import { expect, test } from '@playwright/test';
import { TRAILING_SILENCE_S, WAV_SECONDS } from './playwright.live.config';

test.skip(
  !process.env.DEEPGRAM_API_KEY || !process.env.ANTHROPIC_API_KEY || WAV_SECONDS === 0,
  'needs DEEPGRAM_API_KEY, ANTHROPIC_API_KEY and macOS `say`',
);

// Spoken audio -> real Deepgram -> real stuck detection -> real Claude -> pop-up.
test('a spoken circumlocution produces a pharmacy pop-up through real Deepgram and Claude', async ({
  page,
}) => {
  const events: { at: number; type: string; detail?: string }[] = [];
  let firstAudioAt = 0;
  page.on('websocket', (ws) => {
    ws.on('framesent', (f) => {
      if (!firstAudioAt && typeof f.payload !== 'string') firstAudioAt = Date.now();
    });
    ws.on('framereceived', (f) => {
      if (typeof f.payload !== 'string') return;
      const e = JSON.parse(f.payload) as {
        type: string;
        stt?: string;
        candidates?: { word: string }[];
      };
      events.push({
        at: Date.now(),
        type: e.type,
        detail: e.stt ?? e.candidates?.map((c) => c.word).join('/'),
      });
    });
  });

  await page.goto('/');
  await expect(page.getByRole('status').first()).toHaveText('Server: connected');
  await expect.poll(() => events.find((e) => e.type === 'session.ready')?.detail).toBe('deepgram');

  await page.getByRole('button', { name: 'Start listening' }).click();
  try {
    await expect(page.getByLabel('Word suggestions')).toContainText('pharmacy', {
      timeout: 30_000,
    });
  } catch (err) {
    console.log(
      `no pop-up. audio started: ${firstAudioAt > 0}; events:\n${events.map((e) => `  ${e.type} ${e.detail ?? ''}`).join('\n')}`,
    );
    console.log(`page says: ${await page.getByRole('region', { name: 'Transcript' }).innerText()}`);
    throw err;
  }
  const popupAt = events.find((e) => e.type === 'guess.offered')?.at ?? Date.now();

  const speechEndAt = firstAudioAt + (WAV_SECONDS - TRAILING_SILENCE_S) * 1000;
  const rel = (at: number) => `${((at - speechEndAt) / 1000).toFixed(2)} s`;
  console.log(
    `speech ends at 0; events relative to it:\n` +
      events.map((e) => `  ${rel(e.at)}  ${e.type} ${e.detail ?? ''}`).join('\n') +
      `\nend of speech -> pop-up: ${rel(popupAt)}`,
  );
  await expect(page.getByRole('region', { name: 'Transcript' })).toContainText('medicine');
});
