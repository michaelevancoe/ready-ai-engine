import { existsSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const artifacts = '/opt/cursor/artifacts';

async function save(page: Page, name: string): Promise<void> {
  if (!existsSync(artifacts)) return;
  await page.screenshot({ path: `${artifacts}/${name}`, fullPage: true });
}

test('approve a draft that includes the typed sensory note', async ({ page }) => {
  const robots = await page.request.get('/robots.txt');
  expect(robots.status()).toBe(200);
  expect(robots.headers()['x-robots-tag']).toBe('noindex');
  expect(await robots.text()).toBe('User-agent: *\nDisallow: /\n');
  const root = await page.request.get('/');
  expect(root.headers()['x-robots-tag']).toBe('noindex');
  const intake = await page.request.post('/v1/intake/profile', {
    data: {},
    headers: { 'content-type': 'application/json' },
  });
  expect(intake.headers()['x-robots-tag']).toBe('noindex');
  await page.goto('/');
  await expect(page.getByText("Demo: fictional data only. Please don't enter real child information.")).toBeVisible();
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
