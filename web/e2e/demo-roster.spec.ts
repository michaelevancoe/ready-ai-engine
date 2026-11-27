import { expect, test, type Page } from '@playwright/test';
import { resetSavedVisit } from './walk-tree.ts';

test.beforeEach(({ request }) => resetSavedVisit(request));

const volunteerRows = [
  ['Rowan, 7', 'No brief yet'],
  ['Owen, 8', 'No brief yet'],
  ['Nora, 6', 'Brief ready'],
  ['Ezra, 7', 'Brief ready \u00b7 Notes saved'],
  ['Hazel, 11', 'Brief ready \u00b7 Notes saved'],
  ['Lucy, 10', 'Brief ready \u00b7 Notes saved'],
] as const;

const leaderRows = [
  ['Owen, 8', 'No brief yet'],
  ['Nora, 6', 'No notes yet'],
  ['Ezra, 7', 'Notes from Jordan'],
  ['Hazel, 11', 'Draft to approve'],
  ['Lucy, 10', 'Sent to parent'],
] as const;

async function expectVolunteerRows(page: Page): Promise<void> {
  const rows = page.locator('ul.roster > li');
  await expect(rows).toHaveCount(volunteerRows.length);
  for (const [index, [heading, status]] of volunteerRows.entries()) {
    const row = rows.nth(index);
    await expect(row.getByRole('heading')).toHaveText(heading);
    await expect(row.locator('p')).toHaveText(status);
  }
}

test('a fresh volunteer roster lists the live child and five seeded children', async ({ page }) => {
  await page.goto('/volunteer');
  await expectVolunteerRows(page);
});

test('the leader home lists the other children beside the live child', async ({ page }) => {
  await page.goto('/leader');
  await expect(page.getByRole('heading', { name: 'Good morning, Ms. Dana' })).toBeVisible();
  await expect(page.getByText('Rowan is at Example Harbor Fellowship.')).toBeVisible();
  const region = page.getByRole('region', { name: 'Other children today' });
  await expect(region.getByRole('button')).toHaveCount(0);
  await expect(region.getByRole('link')).toHaveCount(0);
  await expect(region).not.toContainText('Notes from Jordan Ellis');
  const rows = region.locator('li');
  await expect(rows).toHaveCount(leaderRows.length);
  for (const [index, [heading, tag]] of leaderRows.entries()) {
    const row = rows.nth(index);
    await expect(row.locator('span').first()).toHaveText(heading);
    await expect(row.locator('.tag')).toHaveText(tag);
  }
});

test('choosing Maya keeps six rows and a reload returns to Rowan', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Maya, 5/ }).click();
  await page.getByRole('link', { name: 'Volunteer' }).click();
  await expect(page.getByRole('heading', { name: 'Sunday check-in' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Maya, 5', exact: true })).toHaveCount(1);
  const rows = page.locator('ul.roster > li');
  await expect(rows).toHaveCount(6);
  await expect(rows.first().getByRole('heading')).toHaveText('Maya, 5');
  await page.reload();
  await expectVolunteerRows(page);
  await expect(page.getByRole('heading', { name: 'Maya, 5', exact: true })).toHaveCount(0);
});
