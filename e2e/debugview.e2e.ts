import { expect, test } from '@playwright/test';
import { open, say } from './helpers';

test('the debug view is a page of its own and shows what the main window forwards', async ({
  context,
  page,
}) => {
  const view = await context.newPage();
  await view.goto('/?view=debug');
  await expect(view.getByText('Waiting for the main window')).toBeVisible();
  // The main page does not show the debug panel itself.
  await open(page);
  await expect(page.locator('details.debug-panel')).toHaveCount(0);

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('group', { name: 'Settings' }).getByLabel('Debug').check();
  await say(page, 'um I need to go to the the place where you get medicine');
  const panel = view.locator('details.debug-panel');
  await expect(panel).toContainText('raw transcript (fillers kept): um I need');
  await expect(panel.getByRole('list', { name: 'Last debug events' })).toContainText(
    'gate: OFFER pharmacy',
    { timeout: 8000 },
  );
});

test('with debug off nothing is forwarded', async ({ context, page }) => {
  const view = await context.newPage();
  await view.goto('/?view=debug');
  await open(page);
  await say(page, 'um I need to go to the the place where you get medicine');
  await page.waitForTimeout(2500);
  await expect(view.locator('details.debug-panel')).not.toContainText(
    'raw transcript (fillers kept): um',
  );
});
