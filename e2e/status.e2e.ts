import { expect, test } from '@playwright/test';
import { open } from './helpers';

const MESSAGE = 'Word suggestions are unavailable right now; listening continues.';

test('shows a calm line while the guesser is down and clears it when it recovers', async ({
  page,
}) => {
  // The mock guesser never fails, so play the server's guesser.status events from the test.
  let toPage: (data: string) => void = () => undefined;
  await page.routeWebSocket('**/ws', (ws) => {
    ws.connectToServer();
    toPage = (data) => ws.send(data);
  });
  await open(page);

  toPage(JSON.stringify({ type: 'guesser.status', ok: false }));
  await expect(page.getByRole('status').filter({ hasText: MESSAGE })).toBeVisible();

  toPage(JSON.stringify({ type: 'guesser.status', ok: true }));
  await expect(page.getByText(MESSAGE)).toHaveCount(0);
});
