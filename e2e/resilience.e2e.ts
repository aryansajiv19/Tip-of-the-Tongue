import { expect, test } from '@playwright/test';
import { open } from './helpers';

test('page survives the server going away and reconnects when it returns', async ({ page }) => {
  // Stand in for a dead server: close every /ws connection while `down`, otherwise pass through.
  let down = false;
  await page.routeWebSocket('**/ws', (ws) => {
    if (down) {
      void ws.close();
      return;
    }
    ws.connectToServer();
  });
  down = true;
  await page.goto('/?debug=1');
  await expect(page.getByRole('status').first()).toHaveText('Not connected. Reconnecting…');
  await expect(page.getByRole('group', { name: 'Listening controls' })).toBeVisible();

  down = false;
  await expect(page.getByRole('status').first()).toHaveText('Connected', {
    timeout: 20_000,
  });
});

test('shows a calm message when speech recognition is unsupported', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'SpeechRecognition', { value: undefined });
    Object.defineProperty(window, 'webkitSpeechRecognition', { value: undefined });
  });
  await open(page);
  await expect(page.getByRole('alert')).toContainText('no speech recognition');
  await expect(page.getByRole('button', { name: 'Start listening' })).toHaveCount(0);
  await expect(page.getByLabel(/Type a phrase/)).toBeVisible();
});
