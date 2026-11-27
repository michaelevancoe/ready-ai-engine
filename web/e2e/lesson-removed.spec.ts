import { expect, test, type Page } from '@playwright/test';
import { resetSavedVisit } from './walk-tree.ts';

test.beforeEach(({ request }) => resetSavedVisit(request));

const examples = [/Rowan, 7/, /Maya, 5/, /Jonah, 9/] as const;

test('parent, volunteer, and leader show no lesson plan', async ({ page }) => {
  for (const button of examples) {
    await page.goto('/');
    await page.getByRole('button', { name: button }).click();
    await expect(page.getByRole('button', { name: /Print .+ Sunday story/ })).toBeVisible();
    await expectNoLesson(page);
    await page.getByRole('link', { name: 'Volunteer' }).click();
    await expect(page.getByRole('heading', { name: 'Sunday check-in' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Sunday lesson' })).toHaveCount(0);
    await expectNoLesson(page);
    await page.getByRole('link', { name: 'Leader' }).click();
    await expect(page.getByRole('heading', { name: 'Good morning, Ms. Dana' })).toBeVisible();
    await expectNoLesson(page);
    await expect(page.getByRole('button', { name: /Adapt/ })).toHaveCount(0);
    await expect(page.getByText(/paste the lesson/i)).toHaveCount(0);
  }

  await page.goto('/');
  await page.getByRole('button', { name: 'Start with a new child' }).click();
  await page.getByRole('link', { name: 'Leader' }).click();
  await expect(page.getByRole('heading', { name: 'Good morning, Ms. Dana' })).toBeVisible();
  await expectNoLesson(page);
  await expect(page.getByRole('button', { name: /Adapt/ })).toHaveCount(0);
  await expect(page.getByText(/paste the lesson/i)).toHaveCount(0);
  await page.getByRole('link', { name: 'Volunteer' }).click();
  await expect(page.getByRole('heading', { name: 'Sunday check-in' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sunday lesson' })).toHaveCount(0);
  await expectNoLesson(page);
});

async function expectNoLesson(page: Page): Promise<void> {
  await expect(page.getByRole('main')).not.toContainText(/lesson/i);
}
