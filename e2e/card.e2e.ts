import { expect, test, type Page } from '@playwright/test';
import { fakeServer, offered, stuck } from './fakeServer';
import { offer } from './helpers';

const status = (page: Page) => page.getByRole('status').first();

async function start(page: Page) {
  const server = await fakeServer(page);
  await page.goto('/');
  await expect(status(page)).toHaveText('Connected');
  return server;
}

const primary = (page: Page) => offer(page).locator('.card-primary');

test('looks for the word with a shimmer, then shows the best word, two others, dots and the source', async ({
  page,
}) => {
  const server = await start(page);
  server.send(stuck);
  await expect(offer(page)).toContainText('Finding the word');
  expect(await offer(page).getByRole('progressbar').count()).toBe(0); // no spinner
  expect(
    await offer(page)
      .locator('.card-thinking')
      .evaluate((e) => getComputedStyle(e).animationName),
  ).toBe('shimmer');

  server.send(
    offered(
      'a',
      [
        ['licence', 0.6],
        ['renewal', 0.9],
        ['contract', 0.7],
        ['fee', 0.2],
      ],
      'Q3-plan.pdf',
    ),
  );
  await expect(primary(page)).toHaveText('renewal');
  await expect(offer(page).locator('.card-alts button')).toHaveText(['contract', 'licence']);
  await expect(offer(page).locator('.card-source')).toHaveText('from Q3-plan.pdf');
  await expect(offer(page).locator('.card-dots')).toHaveAttribute('data-filled', '3');
  await expect(offer(page)).not.toContainText('Finding the word');
  expect(await offer(page).textContent()).not.toContain('%');
});

test('the confidence dots follow the confidence, one to three', async ({ page }) => {
  const server = await start(page);
  for (const [confidence, filled] of [
    [0.5, '1'],
    [0.7, '2'],
    [0.95, '3'],
  ] as const) {
    server.send(offered(`id${filled}`, [['word', confidence]]));
    await expect(offer(page).locator('.card-dots')).toHaveAttribute('data-filled', filled);
    await expect(offer(page).locator('.card-dots i.on')).toHaveCount(Number(filled));
  }
});

test('no source label when the word has none', async ({ page }) => {
  const server = await start(page);
  server.send(offered('a', [['renewal', 0.9]]));
  await expect(primary(page)).toBeVisible();
  await expect(offer(page).locator('.card-source')).toHaveCount(0);
  await expect(offer(page).locator('.card-alts')).toHaveCount(0);
});

test('when the server says the guess went nowhere, a quiet "…" shows, then clears', async ({
  page,
}) => {
  const server = await start(page);
  server.send(stuck);
  await expect(offer(page)).toContainText('Finding the word');
  server.send({ type: 'guess.idle' });
  await expect(offer(page).locator('.card-none')).toBeVisible();
  await expect(offer(page)).toContainText('No word found'); // for screen readers
  await expect(offer(page).locator('.card-none [aria-hidden]')).toHaveText('…');
  await expect(offer(page)).toHaveText('', { timeout: 4000 });
});

test('with no answer at all, thinking gives up after a few seconds with the same "…"', async ({
  page,
}) => {
  const server = await start(page);
  server.send(stuck);
  await expect(offer(page)).toContainText('Finding the word');
  await expect(offer(page).locator('.card-none')).toBeVisible({ timeout: 6000 });
  await expect(offer(page)).toHaveText('', { timeout: 4000 });
});

test('uses the spec sizes: 420 wide, radius 16, 36 px semibold word, 18 px muted alternatives', async ({
  page,
}) => {
  const server = await start(page);
  server.send(
    offered('a', [
      ['renewal', 0.9],
      ['licence', 0.7],
    ]),
  );
  await expect(primary(page)).toBeVisible();
  const card = await offer(page)
    .locator('.suggestion')
    .evaluate((e) => {
      const s = getComputedStyle(e);
      return { width: e.getBoundingClientRect().width, radius: s.borderTopLeftRadius };
    });
  expect(card).toEqual({ width: 420, radius: '16px' });
  const word = await primary(page).evaluate((e) => {
    const s = getComputedStyle(e);
    return { size: s.fontSize, weight: s.fontWeight, underline: s.textDecorationColor };
  });
  expect(word).toEqual({ size: '36px', weight: '600', underline: 'rgb(125, 211, 252)' });
  const alt = await offer(page)
    .locator('.card-alts button')
    .evaluate((e) => {
      const s = getComputedStyle(e);
      return { size: s.fontSize, color: s.color };
    });
  expect(alt).toEqual({ size: '18px', color: 'rgb(161, 161, 170)' });
});

test('clicking the main word or an alternative picks it, shows a check mark, then the card goes', async ({
  page,
}) => {
  const server = await start(page);
  server.send(
    offered('a', [
      ['renewal', 0.9],
      ['licence', 0.7],
    ]),
  );
  await offer(page).getByRole('button', { name: 'licence' }).click();
  await expect(offer(page).locator('.card-accepted')).toHaveText('licence');
  await expect
    .poll(() => server.sent.find((e) => e.type === 'guess.picked'))
    .toEqual({
      type: 'guess.picked',
      id: 'a',
      word: 'licence',
    });
  // The server's answer arrives; nothing changes.
  server.send({ type: 'guess.accepted', id: 'a', word: 'licence', afterMs: 400 });
  await expect(offer(page)).toHaveText('', { timeout: 3000 });
});

test('saying the word shows a check mark with the spoken word, then the card goes', async ({
  page,
}) => {
  const server = await start(page);
  server.send(
    offered('a', [
      ['renewal', 0.9],
      ['licence', 0.7],
    ]),
  );
  server.send({ type: 'guess.accepted', id: 'a', word: 'licence', afterMs: 900 });
  await expect(offer(page).locator('.card-accepted')).toHaveText('licence');
  await expect(offer(page)).toHaveText('', { timeout: 3000 });
});

test('a suggestion fades out by itself after the linger time', async ({ page }) => {
  await page.clock.install();
  const server = await start(page);
  server.send(offered('a', [['renewal', 0.9]]));
  await expect(primary(page)).toBeVisible();
  await page.clock.fastForward(5500);
  await expect(primary(page)).toBeVisible();
  await page.clock.fastForward(1500);
  await expect(offer(page)).toHaveText('', { timeout: 3000 });
});

test('Escape closes it, and so does the server withdrawing it', async ({ page }) => {
  const server = await start(page);
  server.send(offered('a', [['renewal', 0.9]]));
  await expect(primary(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(offer(page)).toHaveText('');
  server.send(offered('b', [['licence', 0.9]]));
  await expect(primary(page)).toHaveText('licence');
  server.send({ type: 'guess.withdrawn', id: 'b', reason: 'self-recovered' });
  await expect(offer(page)).toHaveText('');
});

test('a new offer replaces the old one', async ({ page }) => {
  const server = await start(page);
  server.send(offered('a', [['renewal', 0.9]]));
  await expect(primary(page)).toHaveText('renewal');
  server.send(offered('b', [['licence', 0.8]]));
  await expect(primary(page)).toHaveText('licence');
});

test('the card is a glass surface with a solid fallback when transparency is reduced', async ({
  page,
}) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }],
  });
  const server = await start(page);
  server.send(offered('a', [['renewal', 0.9]]));
  const style = await offer(page)
    .locator('.suggestion')
    .evaluate((el) => {
      const s = getComputedStyle(el);
      return { bg: s.backgroundColor, blur: s.backdropFilter };
    });
  expect(style.bg).toBe('rgb(20, 20, 22)');
  expect(style.blur).toBe('none');
});

test('with reduced motion nothing moves or shimmers', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const server = await start(page);
  server.send(stuck);
  await expect(offer(page)).toContainText('Finding the word');
  const shimmer = await offer(page)
    .locator('.card-thinking')
    .evaluate((e) => getComputedStyle(e).animationName);
  expect(shimmer).toBe('none');
  const enter = await offer(page)
    .locator('.suggestion')
    .evaluate((e) => getComputedStyle(e).animationDuration);
  expect(enter).toBe('0s');
});

test.describe('problems show as one short line, in red, never a dialog', () => {
  test('the suggestion service is down, then back', async ({ page }) => {
    const server = await start(page);
    server.send({ type: 'guesser.status', ok: false });
    const line = offer(page).locator('.card-problem');
    await expect(line).toHaveText('Suggestions are unavailable right now. Listening continues.');
    expect(await line.evaluate((e) => getComputedStyle(e).color)).toBe('rgb(248, 113, 113)');
    expect(await page.getByRole('dialog').count()).toBe(0);
    server.send({ type: 'guesser.status', ok: true });
    await expect(offer(page)).toHaveText('');
  });

  test('offline, then reconnected', async ({ page }) => {
    let down = true;
    await page.routeWebSocket('**/ws', (ws) => {
      if (down) void ws.close();
      else ws.connectToServer();
    });
    await page.goto('/');
    await expect(offer(page).locator('.card-problem')).toHaveText('Not connected. Reconnecting…');
    down = false;
    await expect(offer(page)).toHaveText('', { timeout: 15_000 });
  });

  test('the microphone is blocked', async ({ page }) => {
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () =>
        Promise.reject(new DOMException('no', 'NotAllowedError'));
    });
    const server = await start(page);
    server.send({ type: 'session.ready', stt: 'deepgram' });
    await page.getByRole('button', { name: 'Start listening' }).click();
    const alert = page.getByRole('alert').filter({ hasText: 'Microphone access was blocked' });
    await expect(alert).toBeVisible();
    await expect(alert.getByRole('button', { name: 'Retry' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start listening' })).toBeVisible();
  });

  test('a problem does not hide a suggestion that is showing', async ({ page }) => {
    const server = await start(page);
    server.send(offered('a', [['renewal', 0.9]]));
    server.send({ type: 'guesser.status', ok: false });
    await expect(primary(page)).toHaveText('renewal');
    await expect(offer(page).locator('.card-problem')).toHaveCount(0);
  });
});

test.describe('continuation', () => {
  const withContinuation = (continuation: string, word = 'pharmacy') => ({
    type: 'guess.offered',
    id: 'c',
    latencyMs: 300,
    candidates: [
      { word, confidence: 0.9, continuation },
      { word: 'chemist', confidence: 0.5, continuation: 'ignored' },
    ],
  });

  test('shows after the bold word, quiet and not bold, on the primary only', async ({ page }) => {
    const server = await start(page);
    server.send(withContinuation('to pick up my tablets'));
    const cont = offer(page).locator('.card-cont');
    await expect(cont).toHaveText('to pick up my tablets');
    expect(await cont.evaluate((e) => getComputedStyle(e).fontWeight)).toBe('400');
    expect(await primary(page).evaluate((e) => getComputedStyle(e).fontWeight)).toBe('600');
    await expect(offer(page).locator('.card-cont')).toHaveCount(1);
    // Read after the word.
    expect(await offer(page).locator('.card-word').innerText()).toMatch(
      /^pharmacy[\s\S]*to pick up/,
    );
    // The button, and so picking, is the word alone.
    await expect(primary(page)).toHaveText('pharmacy');
  });

  test('a long one wraps inside the 420 px card instead of overflowing', async ({ page }) => {
    const server = await start(page);
    server.send(withContinuation('and then the rest of it goes on', 'electroencephalographically'));
    await expect(offer(page).locator('.card-cont')).toBeVisible();
    const fits = await offer(page)
      .locator('.suggestion')
      .evaluate((card) => {
        const box = card.getBoundingClientRect();
        return [...card.querySelectorAll('*')].every((e) => {
          const r = e.getBoundingClientRect();
          return r.left >= box.left - 0.5 && r.right <= box.right + 0.5;
        });
      });
    expect(fits).toBe(true);
  });

  test('is hidden in "first sound" mode', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('tott.help', 'sound'));
    const server = await start(page);
    server.send(withContinuation('to pick up my tablets'));
    await expect(primary(page)).toBeVisible();
    await expect(offer(page).locator('.card-cont')).toHaveCount(0);
  });
});
