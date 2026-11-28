import { expect, test, type Page } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 390, height: 844 } });

const accountMode = process.env.READY_ACCOUNT_E2E === '1';

test('a first visit sets the classroom and stays finished after reload', async ({ page }) => {
  test.skip(accountMode, 'account boot');
  await page.goto('/leader');
  await expect(page.getByRole('heading', { name: 'Welcome to Ready' })).toBeVisible();
  await page.getByRole('button', { name: 'Set up my classroom' }).click();
  await page.getByLabel('Church name').fill('Example Lakeside Chapel');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Example Lakeside Chapel')).toBeVisible();
  await page.getByRole('button', { name: 'Go to leader home' }).click();
  await expect(page.getByText('Rowan is at Example Lakeside Chapel.')).toBeVisible();
  await page.getByRole('button', { name: 'Church settings' }).click();
  await expect(page.getByLabel('Church name')).toHaveValue('Example Lakeside Chapel');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Welcome to Ready' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Good morning, Ms. Dana' })).toBeVisible();
});

test('skip and dismiss hide the setup reminder after reload', async ({ page }) => {
  test.skip(accountMode, 'account boot');
  await page.goto('/leader');
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await expect(page.getByText('Finish setting up your classroom')).toBeVisible();
  await expect(page.getByText('SETUP · 1 OF 4')).toBeVisible();
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome to Ready' })).toBeVisible();
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await page.getByRole('button', { name: 'Dismiss setup reminder' }).click();
  await expect(page.getByText('Finish setting up your classroom')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Welcome to Ready' })).toHaveCount(0);
  await expect(page.getByText('Finish setting up your classroom')).toHaveCount(0);
});

test('the sample tour introduces children, Ezra, and Hazel without sending', async ({ page }) => {
  test.skip(accountMode, 'account boot');
  await page.goto('/leader');
  await page.getByRole('button', { name: 'Explore with sample families' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: "Today's children" })).toBeVisible();
  await expect(page.getByText('1 of 3 · Sample families')).toBeVisible();
  await expectUncovered(page, 'children');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: 'What helps, by Ready' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'After Sunday for Ezra' })).toBeVisible();
  await expect(page.getByText('2 of 3 · Sample families')).toBeVisible();
  await expectUncovered(page, 'summary');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: 'You approve every note' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve and send to parent' })).toBeVisible();
  await expect(page.getByText('3 of 3 · Sample families')).toBeVisible();
  await expectUncovered(page, 'approve');
  await page.getByRole('button', { name: 'Finish tour' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open Hazel, 11, Draft to approve' })).toBeVisible();
});

test('escape closes the sample tour on the first step', async ({ page }) => {
  test.skip(accountMode, 'account boot');
  await page.goto('/leader');
  await page.getByRole('button', { name: 'Explore with sample families' }).click();
  await expect(page.getByRole('dialog', { name: "Today's children" })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('church settings can show the welcome again', async ({ page }) => {
  test.skip(accountMode, 'account boot');
  await page.goto('/leader');
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await page.getByRole('button', { name: 'Church settings' }).click();
  await page.getByRole('button', { name: 'Show welcome again' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome to Ready' })).toBeVisible();
});

test('onboarding and the sample tour do not call the engine', async ({ page }) => {
  test.skip(accountMode, 'account boot');
  const hits: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (url.includes('/v1/') || url.includes('/visit-sync')) hits.push(url);
  });
  await page.goto('/leader');
  await page.getByRole('button', { name: 'Set up my classroom' }).click();
  await page.getByLabel('Church name').fill('Example Lakeside Chapel');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Explore with sample families' }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Finish tour' }).click();
  await expect(page.getByRole('button', { name: 'Open Hazel, 11, Draft to approve' })).toBeVisible();
  expect(hits).toEqual([]);
});

test('account explore uses sample families and exit returns to the church', async ({ page }) => {
  test.skip(!accountMode, 'demo boot');
  const hits: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/visit-sync')) hits.push(request.url());
  });
  await page.goto('/leader');
  await expect(page.getByRole('heading', { name: 'Welcome to Ready' })).toBeVisible();
  await page.getByRole('button', { name: 'Explore with sample families' }).click();
  await expect(page.getByText('Sample families · not your church')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Owen, 8, No brief yet' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Hazel, 11, Draft to approve' })).toBeVisible();
  await page.getByRole('button', { name: 'Exit' }).click();
  await expect(page.getByRole('button', { name: 'Church settings' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Other children today' })).toHaveCount(0);
  for (const name of ['Owen', 'Nora', 'Ezra', 'Hazel', 'Lucy']) {
    await expect(page.getByText(name)).toHaveCount(0);
  }
  expect(hits).toEqual([]);
});

async function expectUncovered(page: Page, target: string): Promise<void> {
  await expect(page.locator(`[data-tour="${target}"]`)).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate((name) => {
        const dialog = document.querySelector('[role="dialog"]');
        const node = document.querySelector(`[data-tour="${name}"]`);
        if (!(dialog instanceof HTMLElement) || !(node instanceof HTMLElement)) return 1;
        const card = dialog.getBoundingClientRect();
        const spot = node.getBoundingClientRect();
        const width = Math.max(0, Math.min(card.right, spot.right) - Math.max(card.left, spot.left));
        const height = Math.max(0, Math.min(card.bottom, spot.bottom) - Math.max(card.top, spot.top));
        return width * height;
      }, target),
    )
    .toBe(0);
}
