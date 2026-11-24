import { existsSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const artifacts = '/opt/cursor/artifacts';
const fictional = "Demo: fictional data only. Please don't enter real child information.";

async function save(page: Page, name: string): Promise<void> {
  if (!existsSync(artifacts)) return;
  await page.screenshot({ path: `${artifacts}/${name}`, fullPage: true });
}

test('a parent approves a brief before volunteer and leader see it', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(fictional)).toHaveCount(1);
  const role = page.getByRole('navigation', { name: 'Role' });
  await expect(role.getByRole('link', { name: 'Parent' })).toHaveAttribute('aria-current', 'page');

  await page.getByLabel('Sensory notes').fill('TICK-QUIET-ROOM');
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByRole('heading', { name: 'Draft', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Approved', exact: true })).toBeVisible();
  await save(page, 'flows-parent-approved.png');

  await page.getByRole('link', { name: 'Volunteer' }).click();
  await expect(page.getByRole('link', { name: 'Volunteer' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByText(fictional)).toHaveCount(1);
  const volunteer = page.getByRole('main');
  await expect(volunteer).not.toContainText('TICK-QUIET-ROOM');
  await expect(volunteer).not.toContainText('Surprise loud songs.');
  await expect(volunteer).not.toContainText('A warning before music.');
  await expect(volunteer).not.toContainText('Soft music and helping with snack cups.');
  await expect(volunteer).not.toContainText('A short warning before a change.');
  await expect(volunteer).toContainText('Rowan Sampleton');
  await expect(volunteer).toContainText('No brief yet');
  await save(page, 'flows-volunteer-withheld.png');

  await page.getByRole('link', { name: 'Parent' }).click();
  await page.getByRole('textbox', { name: 'Medical / health notes' }).fill('TICK-MEDICAL');
  await expect(page.getByRole('switch', { name: 'Medical / health notes' })).toHaveAttribute('aria-checked', 'false');
  await page.getByRole('button', { name: 'Write the Sunday story' }).click();
  const story = page.getByRole('region', { name: 'Sunday story' });
  await expect(story.getByRole('heading', { name: 'Sunday with Rowan' })).toBeVisible();
  await expect(story.getByText('TICK-QUIET-ROOM')).toBeVisible();
  await expect(story).not.toContainText('TICK-MEDICAL');
  await page.getByRole('button', { name: 'Approve story' }).click();
  await page.getByRole('button', { name: 'Approve for Sunday' }).click();
  await save(page, 'flows-parent-brief.png');

  await page.getByRole('link', { name: 'Volunteer' }).click();
  const brief = page.getByRole('region', { name: 'Sunday brief' });
  await expect(brief).toContainText('TICK-QUIET-ROOM');
  await expect(brief).not.toContainText('TICK-MEDICAL');
  await page.getByLabel('Notes after Sunday').fill('TICK-AFTER-SUNDAY');
  await page.getByRole('button', { name: 'Save notes' }).click();
  await save(page, 'flows-volunteer-notes.png');

  await page.getByRole('link', { name: 'Parent' }).click();
  await page.getByRole('button', { name: 'Write the Sunday update' }).click();
  await expect(page.getByRole('region', { name: 'Sunday update' })).toContainText('TICK-AFTER-SUNDAY');

  await page.getByRole('link', { name: 'Leader' }).click();
  await expect(page.getByRole('heading', { name: 'Example Harbor Fellowship' })).toBeVisible();
  await page.getByLabel('Fictional lesson').fill('TICK-LESSON-PLAN');
  await page.getByRole('button', { name: 'Adapt lesson' }).click();
  const lesson = page.getByRole('region', { name: 'Lesson adaptation' });
  await expect(lesson.getByRole('list')).toContainText('TICK-LESSON-PLAN');
  await expect(lesson).not.toContainText('TICK-MEDICAL');
  await save(page, 'flows-leader-lesson.png');
});
