import { existsSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const artifacts = '/opt/cursor/artifacts';

async function save(page: Page, name: string): Promise<void> {
  if (!existsSync(artifacts)) return;
  await page.screenshot({ path: `${artifacts}/${name}`, fullPage: true });
}

test('approve a draft that includes the typed sensory note', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Sensory notes').fill('TICK-QUIET-ROOM');
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByRole('heading', { name: 'Draft' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Sensory considerations' })).toContainText('TICK-QUIET-ROOM');
  await save(page, 'demo-draft.png');
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByRole('heading', { name: 'Approved' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Sensory considerations' })).toContainText('TICK-QUIET-ROOM');
  await save(page, 'demo-approved.png');
});
