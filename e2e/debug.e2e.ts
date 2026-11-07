import { expect, test } from '@playwright/test';
import { say } from './helpers';

test('?debug=1 shows the panel with the raw transcript and the decisions; without it, nothing', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('status').first()).toHaveText('Server: connected');
  await expect(page.getByText('Debug', { exact: true })).toHaveCount(0);

  await page.goto('/?debug=1');
  await expect(page.getByRole('status').first()).toHaveText('Server: connected');
  const panel = page.locator('details.debug-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('silence since last word');

  await say(page, 'um I need to go to the the place where you get medicine');
  await expect(panel).toContainText('raw transcript (fillers kept): um I need');
  await expect(panel.getByRole('list', { name: 'Last debug events' })).toContainText(
    'gate: OFFER pharmacy',
  );
});
