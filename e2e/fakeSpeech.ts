import type { Page } from '@playwright/test';

// A fake SpeechRecognition the test can drive. Each start() makes a new instance.
export async function installFakeSpeech(page: Page) {
  await page.addInitScript(() => {
    interface Fake {
      onstart?: () => void;
      onresult?: ((e: unknown) => void) | null;
      onend?: () => void;
      onerror?: (e: { error: string }) => void;
      stopped: boolean;
      lang: string;
    }
    const instances: Fake[] = [];
    class FakeRecognition {
      stopped = false;
      lang = '';
      onstart?: () => void;
      onresult?: ((e: unknown) => void) | null;
      onend?: () => void;
      onerror?: (e: { error: string }) => void;
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
      lastLang: () => instances.at(-1)?.lang,
      // Like Chrome: `results` is the whole list, one entry per chunk.
      say: (chunks: [string, boolean][]) =>
        last()?.onresult?.({
          resultIndex: 0,
          results: chunks.map(([transcript, isFinal]) => ({ isFinal, 0: { transcript } })),
        }),
      end: () => last()?.onend?.(),
      fail: (error: string) => last()?.onerror?.({ error }),
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
// Like Chrome when the microphone is blocked: an error event, then the session ends.
export const failRecognition = (page: Page, error: string) =>
  page.evaluate(
    (e) => (window as unknown as { fakeSpeech: { fail(e: string): void } }).fakeSpeech.fail(e),
    error,
  );
// The language the newest recognition was started with.
export const recognitionLang = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { fakeSpeech: { lastLang(): string | undefined } }).fakeSpeech.lastLang(),
  );
