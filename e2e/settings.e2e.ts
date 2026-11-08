import { expect, test, type Page } from '@playwright/test';
import { installFakeSpeech } from './fakeSpeech';
import { fakeServer } from './fakeServer';

const status = (page: Page) => page.getByRole('status').first();
const gear = (page: Page) => page.getByRole('button', { name: 'Settings' });
const panel = (page: Page) => page.getByRole('group', { name: 'Settings' });

// Two fake microphones, and a record of what getUserMedia was asked for.
async function installMics(page: Page) {
  await page.addInitScript(() => {
    const asked: unknown[] = [];
    (window as unknown as Record<string, unknown>).asked = asked;
    navigator.mediaDevices.enumerateDevices = async () =>
      [
        { kind: 'audioinput', deviceId: 'default', label: 'Default - Built-in' },
        { kind: 'audioinput', deviceId: 'mic-a', label: 'Built-in Microphone' },
        { kind: 'audioinput', deviceId: 'mic-b', label: 'USB Headset' },
        { kind: 'audiooutput', deviceId: 'spk', label: 'Speakers' },
      ] as MediaDeviceInfo[];
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      asked.push(constraints);
      const ctx = new AudioContext();
      const dest = ctx.createMediaStreamDestination();
      ctx.createOscillator().connect(dest);
      return dest.stream;
    };
  });
}
const asked = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { asked: { audio: { deviceId?: { ideal: string } } }[] }).asked,
  );

test('the gear opens a small popover; Escape and clicking away close it', async ({ page }) => {
  await installMics(page);
  await fakeServer(page);
  await page.goto('/');
  await expect(panel(page)).toHaveCount(0);
  await gear(page).click();
  await expect(panel(page)).toBeVisible();
  await expect(gear(page)).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(panel(page)).toHaveCount(0);
  await gear(page).click();
  await page.mouse.click(5, 400);
  await expect(panel(page)).toHaveCount(0);
});

test('lists the real microphones only, and remembers the choice after a reload', async ({
  page,
}) => {
  await installMics(page);
  await fakeServer(page);
  await page.goto('/');
  await gear(page).click();
  const select = panel(page).getByLabel('Microphone');
  await expect(select.locator('option')).toHaveText([
    'System default',
    'Built-in Microphone',
    'USB Headset',
  ]);
  await select.selectOption('mic-b');
  await page.reload();
  await gear(page).click();
  await expect(panel(page).getByLabel('Microphone')).toHaveValue('mic-b');
});

test('the chosen microphone is used by the level meter in browser mode', async ({ page }) => {
  await installMics(page);
  await installFakeSpeech(page);
  const server = await fakeServer(page);
  await page.goto('/');
  await expect(status(page)).toHaveText('Server: connected');
  server.send({ type: 'session.ready', stt: 'browser' });
  await gear(page).click();
  await panel(page).getByLabel('Microphone').selectOption('mic-a');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Start listening' }).click();
  await expect.poll(async () => (await asked(page)).length).toBeGreaterThan(0);
  expect((await asked(page)).every((c) => c.audio.deviceId?.ideal === 'mic-a')).toBe(true);
});

test('the chosen microphone is used by both capture paths when the server does the recognition', async ({
  page,
}) => {
  await installMics(page);
  const server = await fakeServer(page);
  await page.goto('/');
  await expect(status(page)).toHaveText('Server: connected');
  server.send({ type: 'session.ready', stt: 'deepgram' });
  await gear(page).click();
  await panel(page).getByLabel('Microphone').selectOption('mic-b');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Start listening' }).click();
  await expect.poll(async () => (await asked(page)).length).toBe(2); // audio stream + level meter
  expect((await asked(page)).map((c) => c.audio.deviceId?.ideal)).toEqual(['mic-b', 'mic-b']);
});

test('the default microphone asks for no particular device', async ({ page }) => {
  await installMics(page);
  await installFakeSpeech(page);
  await fakeServer(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Start listening' }).click();
  await expect.poll(async () => (await asked(page)).length).toBeGreaterThan(0);
  expect((await asked(page)).every((c) => c.audio.deviceId === undefined)).toBe(true);
});

test('debug is off by default, remembered, and sends session.debug', async ({ page }) => {
  await installMics(page);
  const server = await fakeServer(page);
  await page.goto('/');
  await expect(status(page)).toHaveText('Server: connected');
  expect(server.count('session.debug')).toBe(0);
  await gear(page).click();
  await expect(panel(page).getByRole('button', { name: 'Open debug view' })).toHaveCount(0);
  await panel(page).getByLabel('Debug').check();
  await expect
    .poll(() => server.sent.find((e) => e.type === 'session.debug'))
    .toEqual({
      type: 'session.debug',
      on: true,
    });
  await expect(panel(page).getByRole('button', { name: 'Open debug view' })).toBeVisible();
  await page.reload();
  await expect.poll(() => server.sent.filter((e) => e.type === 'session.debug').length).toBe(2);
  await gear(page).click();
  await expect(panel(page).getByLabel('Debug')).toBeChecked();
  await panel(page).getByLabel('Debug').uncheck();
  await expect.poll(() => server.sent.at(-1)).toEqual({ type: 'session.debug', on: false });
});

test('the sensitivity choices work from the popover and from the keyboard', async ({ page }) => {
  await installMics(page);
  const server = await fakeServer(page);
  await page.goto('/');
  await gear(page).click();
  await expect(panel(page).getByRole('radio', { name: 'Balanced' })).toBeChecked();
  expect(server.count('session.settings')).toBe(0);
  await panel(page).getByRole('radio', { name: 'Balanced' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(panel(page).getByRole('radio', { name: 'Eager' })).toBeChecked();
  await expect
    .poll(() => server.sent.at(-1))
    .toEqual({
      type: 'session.settings',
      pauseMs: 900,
      minConfidence: 0.45,
    });
});
