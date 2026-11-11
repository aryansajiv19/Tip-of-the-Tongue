import { expect, test } from '@playwright/test';

const MINUTES = Number(process.env.LAG_MINUTES ?? 4);
const q = (xs: number[], p: number) =>
  [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) * p)] ?? 0;

// Does audio fall behind real time on its way from the microphone to the socket? Chunk i holds
// audio from i x 100 ms, so it should arrive i x 100 ms after the first one; the excess is lag
// that built up in the page (worklet, resampler, main thread, socket). The fixed start-up delay
// of the first chunk is not part of it.
test(`audio chunks keep pace with real time for ${MINUTES} minutes`, async ({ page }) => {
  const arrivals: number[] = [];
  await page.routeWebSocket('**/ws', (ws) => {
    ws.send(JSON.stringify({ type: 'session.ready', stt: 'deepgram' }));
    const beat = setInterval(() => ws.send(JSON.stringify({ type: 'heartbeat' })), 5000);
    ws.onClose(() => clearInterval(beat));
    ws.onMessage((m) => {
      if (typeof m !== 'string') arrivals.push(Date.now());
    });
  });
  // How long the page's main thread was blocked: a timer that should fire every 50 ms, and the
  // browser's own long-task report.
  await page.addInitScript(() => {
    const w = window as unknown as { stalls: number[]; longTasks: number[] };
    w.stalls = [];
    w.longTasks = [];
    let last = performance.now();
    setInterval(() => {
      const now = performance.now();
      w.stalls.push(now - last - 50);
      last = now;
    }, 50);
    new PerformanceObserver((l) =>
      l.getEntries().forEach((e) => w.longTasks.push(e.duration)),
    ).observe({
      entryTypes: ['longtask'],
    });
  });

  await page.goto('/');
  await expect(page.getByRole('status').first()).toHaveText('Connected');
  await page.getByRole('button', { name: 'Start listening' }).click();
  await expect.poll(() => arrivals.length, { timeout: 10_000 }).toBeGreaterThan(3);
  await page.waitForTimeout(MINUTES * 60_000);

  const lag = arrivals.map((at, i) => at - (arrivals[0] ?? 0) - i * 100);
  const perMinute = Array.from({ length: Math.ceil(lag.length / 600) }, (_, m) => {
    const part = lag.slice(m * 600, (m + 1) * 600);
    return `min ${m + 1}: median ${q(part, 0.5)} ms, p95 ${q(part, 0.95)} ms, max ${Math.max(...part)} ms`;
  });
  const gaps = arrivals.slice(1).map((at, i) => at - (arrivals[i] ?? 0));
  const page_ = await page.evaluate(() => {
    const w = window as unknown as { stalls: number[]; longTasks: number[] };
    return { stalls: w.stalls, longTasks: w.longTasks };
  });
  console.log(
    [
      `${arrivals.length} chunks in ${MINUTES} min (expected about ${MINUTES * 600})`,
      ...perMinute,
      `gap between chunks: p50 ${q(gaps, 0.5)} ms, p99 ${q(gaps, 0.99)} ms, max ${Math.max(...gaps)} ms`,
      `main-thread timer lateness: p50 ${q(page_.stalls, 0.5).toFixed(1)} ms, p99 ${q(page_.stalls, 0.99).toFixed(1)} ms, max ${Math.max(...page_.stalls).toFixed(1)} ms`,
      `long tasks (over 50 ms): ${page_.longTasks.length}, longest ${Math.max(0, ...page_.longTasks).toFixed(0)} ms`,
    ].join('\n'),
  );
  expect(arrivals.length).toBeGreaterThan(MINUTES * 600 * 0.97);
  expect(q(lag.slice(-600), 0.5) - q(lag.slice(0, 600), 0.5)).toBeLessThan(500);
});
