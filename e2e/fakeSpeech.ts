import type { Page } from '@playwright/test';

// A fake SpeechRecognition the test can drive. Each start() makes a new instance.
export async function installFakeSpeech(page: Page) {
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

export type Chunks = [string, boolean][];
export const say = (page: Page, chunks: Chunks) =>
  page.evaluate(
    (c) => (window as unknown as { fakeSpeech: { say(c: Chunks): void } }).fakeSpeech.say(c),
    chunks,
  );
export const endRecognition = (page: Page) =>
  page.evaluate(() => (window as unknown as { fakeSpeech: { end(): void } }).fakeSpeech.end());
export const instanceCount = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { fakeSpeech: { count(): number } }).fakeSpeech.count(),
  );
