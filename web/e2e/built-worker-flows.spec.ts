import { existsSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { answerTree } from './walk-tree';

const artifacts = '/opt/cursor/artifacts';
const fictional = "Demo: fictional data only. Please don't enter real child information.";

async function tailGap(page: Page): Promise<number> {
  return page.evaluate(() => {
    const last = document.querySelector('main')?.lastElementChild ?? null;
    if (last === null) return window.innerHeight;
    const bottom = last.getBoundingClientRect().bottom + window.scrollY;
    return document.documentElement.scrollHeight - bottom;
  });
}

async function save(page: Page, name: string): Promise<void> {
  if (!existsSync(artifacts)) return;
  await page.screenshot({ path: `${artifacts}/${name}`, fullPage: true });
}

test('a parent approves a brief before volunteer and leader see it', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(fictional)).toHaveCount(1);
  const role = page.getByRole('navigation', { name: 'Role' });
  await expect(role.getByRole('link', { name: 'Parent' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('list', { name: 'Sunday steps' })).toHaveCount(0);

  await page.setViewportSize({ width: 1280, height: 800 });
  await answerTree(page, 'TICK-QUIET-ROOM');
  await expect(page.getByRole('heading', { name: "Rowan's brief" })).toBeVisible();
  expect(await tailGap(page)).toBeLessThan(400);

  await page.getByRole('link', { name: 'Volunteer' }).click();
  await expect(page.getByRole('link', { name: 'Volunteer' })).toHaveAttribute('aria-current', 'page');
  expect(await tailGap(page)).toBeLessThan(400);
  await expect(page.getByText(fictional)).toHaveCount(1);
  const volunteer = page.getByRole('main');
  await expect(volunteer).not.toContainText('TICK-SOFTER-SEAT');
  await expect(volunteer).not.toContainText('Surprise loud songs.');
  await expect(volunteer).not.toContainText('A warning before music.');
  await expect(volunteer).not.toContainText('Soft music and helping with snack cups.');
  await expect(volunteer).not.toContainText('A short warning before a change.');
  await expect(volunteer).toContainText('Rowan Sampleton');
  await expect(volunteer).toContainText('No brief yet');
  await save(page, 'flows-volunteer-withheld.png');

  await page.getByRole('link', { name: 'Parent' }).click();
  await page.getByRole('button', { name: 'Fix something' }).click();
  await page.getByRole('button', { name: 'Sensory', exact: true }).click();
  await page.getByRole('textbox', { name: 'Your answer' }).fill('TICK-SOFTER-SEAT');
  await save(page, 'flows-fix-profile.png');
  await page.getByRole('button', { name: 'Save fix and see the brief' }).click();
  await expect(page.getByText('Saved. Sensory is updated.')).toBeVisible();
  await expect(page.getByText('Updated', { exact: true })).toBeVisible();
  await expect(page.getByText('TICK-SOFTER-SEAT')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Fix something else' })).toBeVisible();
  const posted = page.waitForRequest(
    (request) => request.method() === 'POST' && request.url().includes('/v1/intake/profile'),
  );
  await page.getByRole('button', { name: 'Looks right, approve' }).click();
  const body = (await posted).postDataJSON() as { sensoryNotes?: string };
  expect(body.sensoryNotes).toBe('TICK-SOFTER-SEAT.');
  await expect(page.getByRole('heading', { name: 'Rowan is ready for Sunday' })).toBeVisible();
  await expect(page.getByText('A Sunday story is not part of this demo.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Write the Sunday story' })).toHaveCount(0);
  const update = page.getByRole('region', { name: 'Sunday update' });
  await expect(update).toContainText('Waiting for an approved Sunday update.');
  await expect(update).not.toContainText('TICK-AFTER-SUNDAY');
  await expect(page.getByRole('button', { name: 'Write the Sunday update', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Write the parent note', exact: true })).toHaveCount(0);
  await save(page, 'flows-parent-approved.png');

  await page.getByRole('link', { name: 'Volunteer' }).click();
  const brief = page.getByRole('region', { name: 'Sunday brief' });
  await expect(brief).toContainText('TICK-SOFTER-SEAT');
  await expect(brief).not.toContainText('TICK-MEDICAL');
  await page.getByLabel('Notes after Sunday').fill('TICK-AFTER-SUNDAY');
  await page.getByRole('button', { name: 'Save notes' }).click();
  await save(page, 'flows-volunteer-notes.png');

  await page.getByRole('link', { name: 'Leader' }).click();
  await expect(page.getByRole('region', { name: 'Internal notes' })).toContainText('TICK-AFTER-SUNDAY');
  await page.getByRole('button', { name: 'Write the parent note', exact: true }).click();
  const parentNote = page.getByRole('textbox', { name: 'Parent note' });
  await expect(parentNote).toHaveValue(/Sunday went well for Rowan\./);
  await expect(parentNote).not.toHaveValue(/TICK-AFTER-SUNDAY/);
  await save(page, 'flows-leader-note.png');

  await page.getByRole('link', { name: 'Parent' }).click();
  await expect(update).not.toContainText('TICK-AFTER-SUNDAY');
  await expect(update).not.toContainText('Sunday went well');
  await expect(page.getByRole('button', { name: 'Write the Sunday update', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Write the parent note', exact: true })).toHaveCount(0);

  await page.getByRole('link', { name: 'Leader' }).click();
  await page.getByRole('textbox', { name: 'Parent note' }).fill('Sunday went well for Rowan. The quiet seat helped.\nTheo Park');
  await page.getByRole('button', { name: 'Approve parent note', exact: true }).click();

  await page.getByRole('link', { name: 'Parent' }).click();
  await expect(update).toContainText('Sunday went well for Rowan. The quiet seat helped.');
  await expect(update).toContainText('Theo Park');
  await expect(update).not.toContainText('TICK-AFTER-SUNDAY');
  await save(page, 'flows-parent-note.png');

  await page.getByRole('link', { name: 'Leader' }).click();
  await expect(page.getByRole('heading', { name: 'Example Harbor Fellowship' })).toBeVisible();
  await page.getByLabel('Fictional lesson').fill('TICK-LESSON-PLAN');
  await page.getByRole('button', { name: 'Adapt lesson' }).click();
  const lesson = page.getByRole('region', { name: 'Lesson adaptation' });
  await expect(lesson.getByRole('list')).toContainText('TICK-LESSON-PLAN');
  await expect(lesson).not.toContainText('TICK-MEDICAL');
  await save(page, 'flows-leader-lesson.png');

  await page.getByRole('link', { name: 'Volunteer' }).click();
  await expect(page.getByRole('main')).not.toContainText('TICK-LESSON-PLAN');

  await page.getByRole('link', { name: 'Leader' }).click();
  await page.getByRole('button', { name: 'Approve lesson', exact: true }).click();

  await page.getByRole('link', { name: 'Volunteer' }).click();
  await expect(page.getByRole('main')).toContainText('TICK-LESSON-PLAN');
  await save(page, 'flows-volunteer-lesson.png');
});
