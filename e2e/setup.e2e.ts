import { expect, test, type Page } from '@playwright/test';
import { installFakeSpeech } from './fakeSpeech';
import { fakeServer } from './fakeServer';

type Check = 'ok' | 'invalid' | 'unreachable' | 'missing';
interface Stub {
  have: { anthropic: boolean; deepgram: boolean };
  results: { anthropic: Check; deepgram: Check };
}

// Stands in for the desktop app's preload bridge. Saved keys are kept on the window so the test
// can see what the page sent (and that it never asks for a key back).
async function desktopWith(page: Page, stub: Stub) {
  await page.addInitScript((s: Stub) => {
    const w = window as unknown as Record<string, unknown>;
    const state = { have: { ...s.have }, saved: [] as unknown[] };
    w['keyState'] = state;
    w['tott'] = {
      onCommand: () => () => undefined,
      setHeight: () => undefined,
      captureCardKeys: () => () => undefined,
      report: () => undefined,
      keys: {
        status: async () => ({
          anthropic: state.have.anthropic ? 'set' : 'missing',
          deepgram: state.have.deepgram ? 'set' : 'missing',
        }),
        save: async (k: { anthropic?: string; deepgram?: string }) => {
          state.saved.push(k);
          for (const p of ['anthropic', 'deepgram'] as const) {
            if (k[p] !== undefined) state.have[p] = k[p] !== '';
          }
        },
        test: async () => s.results,
      },
    };
  }, stub);
}

const setup = (page: Page) => page.getByRole('group', { name: /Set up Tip of the Tongue/ });
const saved = (page: Page) =>
  page.evaluate(() => (window as never as { keyState: { saved: unknown[] } }).keyState.saved);

async function launch(page: Page) {
  const server = await fakeServer(page);
  await page.goto('/');
  await expect(page.getByRole('status').first()).toHaveText('Connected');
  return server;
}

test.beforeEach(async ({ page }) => {
  await installFakeSpeech(page);
});

test('a browser has no keys screen', async ({ page }) => {
  await launch(page);
  await page.waitForTimeout(300);
  await expect(setup(page)).toHaveCount(0);
});

test('with a key missing the desktop app shows setup: two fields, links, and a demo button', async ({
  page,
}) => {
  await desktopWith(page, {
    have: { anthropic: false, deepgram: false },
    results: { anthropic: 'missing', deepgram: 'missing' },
  });
  await launch(page);
  const panel = setup(page);
  await expect(panel).toBeVisible();
  await expect(panel.getByLabel(/Anthropic key/)).toHaveAttribute('type', 'password');
  await expect(panel.getByLabel(/Deepgram key/)).toHaveAttribute('type', 'password');
  const links = panel.getByRole('link', { name: 'Get a key' });
  await expect(links).toHaveCount(2);
  await expect(links.nth(0)).toHaveAttribute('href', /console\.anthropic\.com/);
  await expect(links.nth(1)).toHaveAttribute('href', /deepgram\.com/);
  await expect(panel.getByRole('button', { name: 'Try demo mode' })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Save and check' })).toBeDisabled();
  await expect(panel).not.toContainText(/API_KEY|\.env/);
});

test('saving checks each key and says, in plain words, which works and which does not', async ({
  page,
}) => {
  await desktopWith(page, {
    have: { anthropic: false, deepgram: false },
    results: { anthropic: 'ok', deepgram: 'invalid' },
  });
  await launch(page);
  const panel = setup(page);
  await panel.getByLabel(/Anthropic key/).fill('sk-ant-test');
  await panel.getByLabel(/Deepgram key/).fill('dg-test');
  await panel.getByRole('button', { name: 'Save and check' }).click();
  await expect(panel.getByText('Works')).toBeVisible();
  await expect(panel.getByText(/Deepgram did not accept this key/)).toBeVisible();
  expect(await saved(page)).toEqual([{ anthropic: 'sk-ant-test', deepgram: 'dg-test' }]);
  await expect(panel.getByLabel(/Anthropic key/)).toHaveValue('');
});

test('an unreachable service is said plainly', async ({ page }) => {
  await desktopWith(page, {
    have: { anthropic: true, deepgram: false },
    results: { anthropic: 'unreachable', deepgram: 'missing' },
  });
  await launch(page);
  const panel = setup(page);
  await panel.getByLabel(/Deepgram key/).fill('dg-test');
  await panel.getByRole('button', { name: 'Save and check' }).click();
  await expect(panel.getByText(/Could not reach Anthropic.*internet/)).toBeVisible();
});

test('once both keys are set the setup screen shows the result, then goes on Done', async ({
  page,
}) => {
  await desktopWith(page, {
    have: { anthropic: true, deepgram: false },
    results: { anthropic: 'ok', deepgram: 'ok' },
  });
  await launch(page);
  const panel = setup(page);
  await panel.getByLabel(/Deepgram key/).fill('dg-test');
  await panel.getByRole('button', { name: 'Save and check' }).click();
  // The result stays readable until the user is done.
  await expect(panel.getByText('Works').first()).toBeVisible();
  await panel.getByRole('button', { name: 'Done' }).click();
  await expect(setup(page)).toHaveCount(0);
});

test('Try demo mode closes setup, and it stays closed after a reload', async ({ page }) => {
  await desktopWith(page, {
    have: { anthropic: false, deepgram: false },
    results: { anthropic: 'missing', deepgram: 'missing' },
  });
  await launch(page);
  await setup(page).getByRole('button', { name: 'Try demo mode' }).click();
  await expect(setup(page)).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('status').first()).toHaveText('Connected');
  await page.waitForTimeout(300);
  await expect(setup(page)).toHaveCount(0);
});

test('Settings has the same keys form, and never shows a saved key', async ({ page }) => {
  await desktopWith(page, {
    have: { anthropic: true, deepgram: true },
    results: { anthropic: 'ok', deepgram: 'ok' },
  });
  await launch(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  const keys = page
    .getByRole('group', { name: 'Settings' })
    .locator('fieldset', { hasText: 'Keys' });
  await expect(keys.getByLabel(/Anthropic key/)).toHaveValue('');
  await expect(keys.getByLabel(/Anthropic key/)).toHaveAttribute('placeholder', /Saved/);
  await keys.getByRole('button', { name: 'Remove key' }).first().click();
  await expect.poll(() => saved(page)).toEqual([{ anthropic: '' }]);
  await keys.getByRole('button', { name: 'Save and check' }).click();
  await expect(keys.getByText('Works').first()).toBeVisible();
});

test.describe('the demo banner', () => {
  test('shows while the server runs the mock guesser, and not for the real one', async ({
    page,
  }) => {
    const server = await launch(page);
    const banner = page.getByText('Demo: suggestions are examples');
    await expect(banner).toHaveCount(0);
    server.send({ type: 'session.ready', stt: 'browser', guesser: 'mock' });
    await expect(banner).toBeVisible();
    server.send({ type: 'session.ready', stt: 'browser', guesser: 'claude' });
    await expect(banner).toHaveCount(0);
  });

  test('a refused key and a busy service each say so', async ({ page }) => {
    const server = await launch(page);
    server.send({ type: 'guesser.status', ok: false, reason: 'key' });
    await expect(page.locator('.card-problem')).toHaveText(/Your Anthropic key isn.t working/);
    server.send({ type: 'guesser.status', ok: false, reason: 'busy' });
    await expect(page.locator('.card-problem')).toHaveText(/AI service is busy/);
    server.send({ type: 'guesser.status', ok: true });
    await expect(page.locator('.card-problem')).toHaveCount(0);
  });
});
