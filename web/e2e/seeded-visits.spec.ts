import { expect, test, type Page } from '@playwright/test';
import { resetSavedVisit } from './walk-tree.ts';

test.beforeEach(({ request }) => resetSavedVisit(request));

const accountMode = process.env.READY_ACCOUNT_E2E === '1';

async function openChild(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: `Open ${name}` }).click();
}

test('leader rows open each sample child and a reload restores the seeds', async ({ page }) => {
  test.skip(accountMode, 'account boot');
  const drafts: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/v1/drafts/sunday-update')) drafts.push(request.url());
  });

  await page.goto('/leader');
  await expect(page.getByRole('heading', { name: 'Good morning, Ms. Dana' })).toBeVisible();
  await expect(page.getByText('Rowan is at Example Harbor Fellowship.')).toBeVisible();
  await expect(page.getByText('Sample children. Tap one to try any leader step.')).toBeVisible();
  const region = page.getByRole('region', { name: 'Other children today' });
  await expect(region.getByRole('button')).toHaveCount(5);

  await openChild(page, 'Ezra, 7, Ready to draft');
  await expect(page.getByText('Sample child · resets on reload')).toBeVisible();
  await expect(page.getByText(/block tower/)).toBeVisible();
  await page.getByRole('button', { name: "Draft a note for Ezra's parent" }).click();
  const note = page.getByRole('textbox', { name: 'Parent note' });
  await expect(note).toHaveValue(/Ezra stayed for the whole story/);
  await expect(note).toHaveValue(/\n\nMs\. Dana\nExample Harbor Fellowship$/);
  expect(drafts).toEqual([]);
  await page.getByRole('button', { name: "Today's list" }).click();
  await expect(page.getByRole('heading', { name: 'Other children today' })).toBeVisible();

  await openChild(page, 'Hazel, 11, Draft to approve');
  await page.getByRole('button', { name: 'Approve and send to parent' }).click();
  await expect(page.getByText("Sent to Hazel's parent · Sunday 12:05 PM")).toBeVisible();
  await page.getByRole('button', { name: "Today's list" }).click();
  await expect(page.getByRole('button', { name: 'Open Hazel, 11, Sent to parent' })).toBeVisible();

  await openChild(page, 'Lucy, 10, Sent to parent');
  await expect(page.getByText(/Lucy had a great morning/)).toBeVisible();
  await expect(page.getByText("Sent to Lucy's parent · Sunday 12:05 PM")).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve and send to parent' })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Parent note' })).toHaveCount(0);
  await page.getByRole('button', { name: "Today's list" }).click();

  await openChild(page, 'Nora, 6, No notes yet');
  await expect(page.getByText('No notes yet. Jordan adds them after class, then you can draft a note for Nora\'s parent.')).toBeVisible();
  await expect(page.getByText('Open Ezra (notes in) or Hazel (draft to approve)')).toBeVisible();
  await page.getByRole('button', { name: "Today's list" }).click();

  await openChild(page, 'Owen, 8, No brief yet');
  await expect(page.getByText("No Sunday brief yet. Owen's parent hasn't approved one")).toBeVisible();
  await expect(page.getByText('switch to Parent')).toBeVisible();

  await page.reload();
  await expect(page.getByRole('button', { name: 'Open Hazel, 11, Draft to approve' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Hazel, 11, Sent to parent' })).toHaveCount(0);
});

test('volunteer rows open each child and return to the list', async ({ page }) => {
  test.skip(accountMode, 'account boot');
  await page.goto('/volunteer');
  await expect(page.getByRole('button', { name: 'Open Rowan, 7, No brief yet' })).toBeVisible();
  await expect(page.getByText('Owen, Nora, Ezra, Hazel and Lucy are sample children.')).toBeVisible();
  const rows = page.locator('ul.roster > li');
  await expect(rows).toHaveCount(6);

  await page.getByRole('button', { name: 'Open Rowan, 7, No brief yet' }).click();
  await expect(page.getByText("Rowan's parent has not approved a Sunday brief.")).toBeVisible();
  await expect(page.getByText('Sample child · resets on reload')).toHaveCount(0);
  await page.getByRole('button', { name: 'All children' }).click();

  await page.getByRole('button', { name: 'Open Nora, 6, Brief ready' }).click();
  await expect(page.getByRole('region', { name: 'Sunday brief' })).toContainText('horses');
  await expect(page.getByLabel('Notes after Sunday')).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Save notes' })).toBeVisible();
  await expect(page.getByText('Sample child · resets on reload')).toBeVisible();
  await page.getByRole('button', { name: 'All children' }).click();

  for (const [label, note] of [
    ['Open Ezra, 7, Brief ready · Notes saved', 'block tower'],
    ['Open Hazel, 11, Brief ready · Notes saved', 'craft supplies'],
    ['Open Lucy, 10, Brief ready · Notes saved', 'story time'],
  ] as const) {
    await page.getByRole('button', { name: label }).click();
    await expect(page.getByRole('region', { name: 'Sunday brief' })).toBeVisible();
    await expect(page.getByLabel('Notes after Sunday')).toHaveValue(new RegExp(note));
    await expect(page.getByRole('button', { name: 'Update notes' })).toBeVisible();
    await page.getByRole('button', { name: 'All children' }).click();
  }

  await page.getByRole('button', { name: 'Open Owen, 8, No brief yet' }).click();
  await expect(page.getByText("Owen's parent hasn't shared a Sunday brief yet.")).toBeVisible();
  await expect(page.getByText("Volunteers can't make one.")).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save notes' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Update notes' })).toHaveCount(0);
  await page.getByRole('button', { name: 'All children' }).click();
  await expect(rows).toHaveCount(6);
});

test('opening Maya keeps six children and a reload returns to Rowan', async ({ page }) => {
  test.skip(accountMode, 'account boot');
  await page.goto('/');
  await page.getByRole('button', { name: /Maya, 5/ }).click();
  await page.getByRole('link', { name: 'Volunteer' }).click();
  await expect(page.locator('ul.roster > li')).toHaveCount(6);
  await expect(page.getByRole('heading', { name: 'Maya, 5', exact: true })).toHaveCount(1);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Rowan, 7', exact: true })).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Maya, 5', exact: true })).toHaveCount(0);
});

test('account mode shows one child and no sample visits', async ({ page }) => {
  test.skip(!accountMode, 'demo boot');
  await page.goto('/volunteer');
  await expect(page.locator('ul.roster > li')).toHaveCount(1);
  await expect(page.getByText('Sample child')).toHaveCount(0);
  await expect(page.getByText('Owen, 8')).toHaveCount(0);
  await expect(page.getByText('Nora, 6')).toHaveCount(0);
  await expect(page.getByText('Ezra, 7')).toHaveCount(0);
  await expect(page.getByText('Hazel, 11')).toHaveCount(0);
  await expect(page.getByText('Lucy, 10')).toHaveCount(0);
  await page.goto('/leader');
  await expect(page.getByRole('region', { name: 'Other children today' })).toHaveCount(0);
  await expect(page.getByText('Sample child')).toHaveCount(0);
  await expect(page.getByText('Sample children')).toHaveCount(0);
});
