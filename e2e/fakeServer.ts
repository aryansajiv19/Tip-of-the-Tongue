import type { Page } from '@playwright/test';

// Plays the server: the test answers on /ws and sees what the page sends (JSON only).
export async function fakeServer(page: Page) {
  const sent: { type: string; [key: string]: unknown }[] = [];
  let toPage: (data: string) => void = () => undefined;
  await page.routeWebSocket('**/ws', (ws) => {
    toPage = (data) => ws.send(data);
    ws.onMessage((m) => {
      if (typeof m === 'string') sent.push(JSON.parse(m) as (typeof sent)[number]);
    });
  });
  return {
    sent,
    send: (event: object) => toPage(JSON.stringify(event)),
    count: (type: string) => sent.filter((e) => e.type === type).length,
  };
}

export const stuck = { type: 'stuck.detected', reason: 'pause', contextWindow: 'the' };

export const offered = (id: string, words: [string, number][], source?: string) => ({
  type: 'guess.offered',
  id,
  latencyMs: 300,
  // The source belongs to the most confident word.
  candidates: words.map(([word, confidence]) => ({
    word,
    confidence,
    ...(source && confidence === Math.max(...words.map((w) => w[1])) ? { source } : {}),
  })),
});
