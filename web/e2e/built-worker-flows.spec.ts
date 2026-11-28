import { existsSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { answerTree, resetSavedVisit } from './walk-tree';

test.beforeEach(({ request }) => resetSavedVisit(request));

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

async function send(page: Page, text: string, next: string): Promise<void> {
  await page.getByRole('textbox', { name: 'Your answer' }).fill(text);
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByText(next).first()).toBeVisible();
}

async function save(page: Page, name: string): Promise<void> {
  if (!existsSync(artifacts)) return;
  await page.screenshot({ path: `${artifacts}/${name}`, fullPage: true });
}

test('a food allergy follow-up is on the volunteer brief', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Before you start: who sees what you share' })).toBeVisible();
  await expect(
    page.getByText(
      "Only your child's kids-ministry leader and this Sunday's volunteers at Example Harbor Fellowship see the brief.",
    ),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Start with a new child' }).click();
  await send(page, 'Rowan', 'How old is Rowan');
  await send(page, '7', 'how would you describe Rowan');
  await send(page, 'He likes a quiet hello.', 'What does Rowan love');
  await send(page, 'Trains.', 'What tends to overwhelm');
  await send(page, 'Crowded doorways.', 'feel calm again');
  await send(page, 'A quiet corner and a heads-up before the next song.', 'let you know what they need');
  await send(page, 'Picture cards.', 'What sensory things');
  await send(page, 'TICK-QUIET-ROOM', 'time for the bathroom');
  await send(page, 'Tells an adult', 'any allergies');
  await send(page, 'Food allergy', 'allergic reaction');
  await send(page, 'TICK-ALLERGY-PLAN', 'hurting themselves or others');
  await send(page, 'No, not usually', "Rowan's brief");
  await expect(page.getByRole('heading', { name: 'What helps Rowan' })).toBeVisible();
  await expect(page.getByText('Ready wrote this from your answers.')).toBeVisible();
  await save(page, 'summary-parent-review.png');
  await page.getByRole('button', { name: 'Looks right, approve' }).click();
  await expect(page.getByRole('heading', { name: 'Rowan is ready for Sunday' })).toBeVisible();
  await page.getByRole('link', { name: 'Volunteer' }).click();
  await page.getByRole('button', { name: 'Open Rowan, 7, Brief ready' }).click();
  const allergies = page.locator('[data-field="allergies"]');
  await expect(allergies.getByRole('heading', { name: 'Allergies & health' })).toBeVisible();
  await expect(allergies).toContainText('TICK-ALLERGY-PLAN');
  await expect(
    page.getByText("Shared by Rowan's parent for this Sunday's team only. Care notes are in the parent's own words."),
  ).toBeVisible();
});

test('approving again replaces Trains on the volunteer brief', async ({ page }) => {
  await page.goto('/');
  await answerTree(page, 'TICK-QUIET-ROOM');
  await page.getByRole('button', { name: 'Looks right, approve' }).click();
  await expect(page.getByRole('heading', { name: 'Rowan is ready for Sunday' })).toBeVisible();
  await page.getByRole('link', { name: 'Volunteer' }).click();
  await page.getByRole('button', { name: 'Open Rowan, 7, Brief ready' }).click();
  await expect(page.getByRole('region', { name: 'Sunday brief' })).toContainText('Trains.');
  await page.getByRole('link', { name: 'Parent' }).click();
  await page.getByRole('button', { name: 'Something changed? Update the brief' }).click();
  await page.getByRole('button', { name: 'Fix something' }).click();
  await page.getByRole('button', { name: 'Loves', exact: true }).click();
  await page.getByRole('textbox', { name: 'Your answer' }).fill('Painted rocks');
  await page.getByRole('button', { name: 'Save fix and see the brief' }).click();
  await page.getByRole('button', { name: 'Looks right, approve' }).click();
  await expect(page.getByRole('heading', { name: 'Rowan is ready for Sunday' })).toBeVisible();
  await page.getByRole('link', { name: 'Volunteer' }).click();
  await page.getByRole('button', { name: 'Open Rowan, 7, Brief ready' }).click();
  const brief = page.getByRole('region', { name: 'Sunday brief' });
  await expect(brief).toContainText('Painted rocks');
  await expect(brief).not.toContainText('Trains.');
});

test('a parent approves a brief before volunteer and leader see it', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(fictional)).toHaveCount(1);
  const role = page.getByRole('navigation', { name: 'Role' });
  await expect(role.getByRole('link', { name: 'Parent' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('list', { name: 'Sunday steps' })).toHaveCount(0);

  await page.setViewportSize({ width: 1280, height: 800 });
  await answerTree(page, 'TICK-QUIET-ROOM');
  await expect(page.getByRole('heading', { name: "Rowan's brief", exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: "Who sees Rowan's brief" })).toBeVisible();
  await expect(
    page.getByText("Ms. Dana and this Sunday's volunteers at Example Harbor Fellowship. No one else."),
  ).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  expect(await tailGap(page)).toBeLessThan(400);

  await page.getByRole('link', { name: 'Volunteer' }).click();
  await expect(page.getByRole('link', { name: 'Volunteer' })).toHaveAttribute('aria-current', 'page');
  expect(await tailGap(page)).toBeLessThan(480);
  await expect(page.getByText(fictional)).toHaveCount(1);
  const volunteer = page.getByRole('main');
  await expect(volunteer).not.toContainText('TICK-SOFTER-SEAT');
  await expect(volunteer).not.toContainText('Surprise loud songs.');
  await expect(volunteer).not.toContainText('A warning before music.');
  await expect(volunteer).not.toContainText('Soft music and helping with snack cups.');
  await expect(volunteer).not.toContainText('A short warning before a change.');
  await expect(volunteer).toContainText('Rowan, 7');
  await expect(volunteer).not.toContainText('Rowan Sampleton');
  await expect(volunteer).not.toContainText('Quinn');
  await expect(volunteer).toContainText('No brief yet');
  await save(page, 'flows-volunteer-withheld.png');

  await page.getByRole('link', { name: 'Leader' }).click();
  await expect(page.getByRole('heading', { name: 'Good morning, Ms. Dana' })).toBeVisible();
  await expect(page.getByRole('main')).not.toContainText(/lesson/i);

  await page.getByRole('link', { name: 'Parent' }).click();
  await page.getByRole('button', { name: 'Fix something' }).click();
  await page.getByRole('button', { name: 'Sensory', exact: true }).click();
  await page.getByRole('textbox', { name: 'Your answer' }).fill('TICK-SOFTER-SEAT');
  await save(page, 'flows-fix-profile.png');
  const posted = page.waitForRequest(
    (request) => request.method() === 'POST' && request.url().includes('/v1/intake/profile'),
  );
  await page.getByRole('button', { name: 'Save fix and see the brief' }).click();
  const body = (await posted).postDataJSON() as { sensoryNotes?: string };
  expect(body.sensoryNotes).toBe('TICK-SOFTER-SEAT.');
  await expect(page.getByText('Saved. Sensory is updated.')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.getByText('Updated', { exact: true })).toBeVisible();
  await expect(page.getByText('TICK-SOFTER-SEAT').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Fix something else' })).toBeVisible();
  await page.getByRole('button', { name: 'Looks right, approve' }).click();
  await expect(page.getByRole('heading', { name: 'Rowan is ready for Sunday' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'A Sunday story for Rowan' })).toBeVisible();
  await expect(page.getByText('A short Sunday story about what Sunday will look like.')).toBeVisible();
  await expect(page.getByText('picture story')).toHaveCount(0);
  await expect(page.getByRole('button', { name: "Read Rowan's story" })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Write the Sunday story' })).toHaveCount(0);
  const update = page.getByRole('region', { name: 'Sunday update' });
  await expect(update).toContainText('Waiting for an approved Sunday update.');
  await expect(update).not.toContainText('TICK-AFTER-SUNDAY');
  await expect(page.getByRole('button', { name: 'Write the Sunday update', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Write the parent note', exact: true })).toHaveCount(0);
  await save(page, 'flows-parent-approved.png');

  await page.getByRole('link', { name: 'Volunteer' }).click();
  await page.getByRole('button', { name: 'Open Rowan, 7, Brief ready' }).click();
  const brief = page.getByRole('region', { name: 'Sunday brief' });
  await expect(brief).toContainText('TICK-SOFTER-SEAT');
  await expect(brief).not.toContainText('TICK-MEDICAL');
  await page.getByLabel('Notes after Sunday').fill('TICK-AFTER-SUNDAY');
  await page.getByRole('button', { name: 'Save notes' }).click();
  await save(page, 'flows-volunteer-notes.png');

  await page.getByRole('link', { name: 'Leader' }).click();
  await page.getByRole('button', { name: /Rowan, 7\s+Ready to draft/ }).click();
  await expect(page.getByRole('region', { name: 'Internal notes' })).toContainText('TICK-AFTER-SUNDAY');
  await page.getByRole('button', { name: "Draft a note for Rowan's parent", exact: true }).click();
  const parentNote = page.getByRole('textbox', { name: 'Parent note' });
  await expect(parentNote).toHaveValue(/Sunday went well for Rowan\./);
  await expect(parentNote).toHaveValue(/\n\nMs\. Dana\nExample Harbor Fellowship$/);
  await expect(parentNote).not.toHaveValue(/Jordan Ellis/);
  await expect(parentNote).not.toHaveValue(/TICK-AFTER-SUNDAY/);
  await save(page, 'flows-leader-note.png');
  await page.getByRole('button', { name: 'Approve and send to parent', exact: true }).click();

  await page.getByRole('link', { name: 'Parent' }).click();
  await expect(update).toContainText('Sunday went well for Rowan.');
  await expect(update).toContainText('Ms. Dana');
  await expect(update).toContainText('Example Harbor Fellowship');
  await expect(update).not.toContainText('Jordan Ellis');
  await expect(update).not.toContainText('TICK-AFTER-SUNDAY');
  await expect(page.getByRole('button', { name: 'Write the Sunday update', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Write the parent note', exact: true })).toHaveCount(0);
  await save(page, 'flows-parent-note.png');

  await page.getByRole('link', { name: 'Leader' }).click();
  await page.getByRole('button', { name: 'Church settings' }).click();
  await page.getByLabel('Leader').fill('Ms. Rivera');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: /Rowan, 7\s+Sent to parent/ }).click();
  await expect(page.getByRole('heading', { name: "Note sent to Rowan's parent" })).toBeVisible();
  await expect(page.getByRole('button', { name: "Draft a note for Rowan's parent" })).toHaveCount(0);
});

test('the home page description does not name the sample family', async ({ page }) => {
  const response = await page.goto('/');
  const html = (await response?.text()) ?? '';
  expect(html).not.toContain('Rowan Sampleton');
  const description = await page.locator('meta[name="description"]').getAttribute('content');
  expect(description ?? '').not.toMatch(/Sampleton|Rowan|Avery/);
  expect(description).toBe(
    'Ready helps a family share what helps their child on Sunday, so the kids ministry team is ready to welcome them.',
  );
});

test('each example opens a brief for the volunteer', async ({ page }) => {
  const examples = [
    [/Rowan, 7/, 'Rowan loves Disney stories and quiet songs.', 'Rowan, 7'],
    [/Maya, 5/, 'Maya loves dinosaurs and digging in the sand table.', 'Maya, 5'],
    [/Jonah, 9/, 'Jonah loves Lego and building on the floor.', 'Jonah, 9'],
  ] as const;
  for (const [button, line, heading] of examples) {
    await page.goto('/');
    await page.getByRole('button', { name: button }).click();
    await page.getByRole('link', { name: 'Volunteer' }).click();
    await page.getByRole('button', { name: `Open ${heading}, Brief ready` }).click();
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    const brief = page.getByRole('region', { name: 'Sunday brief' });
    await expect(brief).toContainText(line);
    await expect(brief).not.toContainText('Medical');
    await expect(page.getByLabel('Notes after Sunday')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Sunday lesson' })).toHaveCount(0);
  }
});

test('reading a Sunday story stays on the page and try again recovers', async ({ page }) => {
  let failures = 0;
  await page.route('**/v1/drafts/social-story', async (route) => {
    failures += 1;
    if (failures === 1) {
      await route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'generation_failed' }),
      });
      return;
    }
    await route.continue();
  });
  await page.goto('/');
  await page.getByRole('button', { name: /Maya, 5/ }).click();
  await expect(page.getByText('A short Sunday story about what Sunday will look like.')).toBeVisible();
  await expect(page.getByText('picture story')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Write the Sunday story' })).toHaveCount(0);
  await page.getByRole('button', { name: "Read Maya's story" }).click();
  await expect(page.getByRole('button', { name: '← Maya is ready for Sunday' })).toBeVisible();
  await expect(page.getByRole('heading', { name: "The story isn't ready yet" })).toBeVisible();
  await expect(page.getByText("Nothing is lost, and Maya's brief is still approved.")).toBeVisible();
  expect(new URL(page.url()).hash).toBe('');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('heading', { name: 'Sunday with Maya' })).toBeVisible();
  await expect(page.getByText('walks in the front doors')).toBeVisible();
  const readerPictures = page.locator('.story-card .sunday-print-picture');
  await expect(readerPictures).toHaveCount(7);
  await expect(readerPictures.nth(3).locator('img')).toHaveAttribute('src', '/sunday-story/classroom.jpg');
  await expect(page.locator('.story-card').getByRole('region', { name: 'My Sunday schedule' })).toBeVisible();
  await expect(page.getByText('Written by Ready · only from your approved answers')).toBeVisible();
  await expect(
    page.getByText(
      "Ready used only your approved answers and Harbor Room's plan. Medical details and labels stay out of Maya's story.",
    ),
  ).toBeVisible();
  expect(new URL(page.url()).hash).toBe('');
  await page.unroute('**/v1/drafts/social-story');

  for (const [button, name] of [
    [/Jonah, 9/, 'Jonah'],
    [/Rowan, 7/, 'Rowan'],
  ] as const) {
    await page.goto('/');
    await page.getByRole('button', { name: button }).click();
    await page.getByRole('button', { name: `Read ${name}'s story` }).click();
    await expect(page.getByRole('heading', { name: `Sunday with ${name}` })).toBeVisible();
    await expect(page.getByText('walks in the front doors')).toBeVisible();
    expect(new URL(page.url()).hash).toBe('');
    await expect(page.getByRole('button', { name: 'Write the Sunday story' })).toHaveCount(0);
  }

  await page.goto('/');
  await answerTree(page, 'TICK-QUIET-ROOM');
  await page.getByRole('button', { name: 'Looks right, approve' }).click();
  await page.getByRole('button', { name: "Read Rowan's story" }).click();
  await expect(page.getByRole('heading', { name: 'Sunday with Rowan' })).toBeVisible();
  await expect(page.getByText('walks in the front doors')).toBeVisible();
  expect(new URL(page.url()).hash).toBe('');
  await expect(page.getByRole('button', { name: 'Write the Sunday story' })).toHaveCount(0);
});

test('leader settings save, and back without saving keeps the church', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Rowan, 7/ }).click();
  await page.getByRole('link', { name: 'Leader' }).click();
  await page.getByRole('button', { name: 'Church settings' }).click();
  await page.getByLabel('Room', { exact: true }).fill('North room');
  await page.getByRole('button', { name: 'Leader home' }).click();
  await expect(page.getByText('Harbor Room · Sunday 9:00')).toBeVisible();
  await page.getByRole('button', { name: 'Church settings' }).click();
  await expect(page.getByLabel('Room', { exact: true })).toHaveValue('Harbor Room');
  await page.getByLabel('Room', { exact: true }).fill('North room');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved')).toBeVisible();
  await expect(page.getByText('North room · Sunday 9:00')).toBeVisible();
});

test('a parent prints one page per step and a classroom photo replaces the sample', async ({ page }) => {
  await page.addInitScript(() => {
    const host = window as Window & { __printCount?: number };
    host.__printCount = 0;
    window.print = () => {
      host.__printCount = (host.__printCount ?? 0) + 1;
    };
  });
  const social: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/v1/drafts/social-story')) social.push(request.url());
  });
  await page.goto('/');
  await page.getByRole('button', { name: /Rowan, 7/ }).click();
  await expect(page.getByText('A short Sunday story about what Sunday will look like.')).toBeVisible();
  await expect(page.getByText('picture story')).toHaveCount(0);
  const print = page.getByRole('button', { name: "Print Rowan's Sunday story" });
  await expect(print).toBeVisible();
  await print.click();
  await expect.poll(() => page.evaluate(() => (window as Window & { __printCount?: number }).__printCount ?? 0)).toBe(1);
  expect(social).toEqual([]);

  await page.emulateMedia({ media: 'screen' });
  await expect(page.locator('.sunday-print')).toBeHidden();
  const pages = page.locator('article.sunday-print-page');
  await expect(pages).toHaveCount(8);
  for (const article of await pages.all()) await expect(article).toBeHidden();

  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('nav.role-nav')).toBeHidden();
  await expect(page.locator('.fictional')).toBeHidden();
  await expect(page.locator('#sunday-story button')).toHaveCount(2);
  for (const button of await page.locator('#sunday-story button').all()) await expect(button).toBeHidden();
  await expect(pages).toHaveCount(8);
  const marks = ['Cover', '1', '2', '3', '4', '5', '6', '7'];
  for (let index = 0; index < marks.length; index += 1) {
    const article = pages.nth(index);
    await expect(article).toBeVisible();
    await expect(article.locator('.sunday-print-mark')).toHaveText(marks[index] ?? '');
    const images = article.locator('img');
    const drawings = article.locator('svg');
    const imageCount = await images.count();
    const drawingCount = await drawings.count();
    expect(imageCount + drawingCount).toBeGreaterThan(0);
    if (imageCount > 0) await expect(images.first()).toHaveAttribute('alt', /.+/);
    else await expect(drawings.first()).toHaveAttribute('aria-label', /.+/);
  }
  await expect(pages.nth(4).getByRole('region', { name: 'My Sunday schedule' })).toBeVisible();

  await page.emulateMedia({ media: 'screen' });
  await page.getByRole('link', { name: 'Leader' }).click();
  await page.getByRole('button', { name: 'Church settings' }).click();
  const classroom = page.getByRole('region', { name: 'Classroom' });
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  await classroom.locator('input[type="file"]').setInputFiles({ name: 'room.png', mimeType: 'image/png', buffer: png });
  await expect(classroom.getByRole('button', { name: 'Clear' })).toBeVisible();
  await expect(classroom.locator('img')).toHaveAttribute('src', /^blob:/);
  await page.getByRole('link', { name: 'Parent' }).click();
  await page.emulateMedia({ media: 'print' });
  await expect(pages.nth(4).locator('img')).toHaveAttribute('src', /^blob:/);
  await expect(pages.nth(4).getByRole('region', { name: 'My Sunday schedule' })).toBeVisible();

  await page.emulateMedia({ media: 'screen' });
  await page.getByRole('link', { name: 'Leader' }).click();
  await page.getByRole('button', { name: 'Church settings' }).click();
  await page.getByRole('region', { name: 'Classroom' }).getByRole('button', { name: 'Clear' }).click();
  await page.getByRole('link', { name: 'Parent' }).click();
  await page.emulateMedia({ media: 'print' });
  await expect(pages.nth(4).locator('img')).toHaveAttribute('src', '/sunday-story/classroom.jpg');
  await expect(pages.nth(4).getByRole('region', { name: 'My Sunday schedule' })).toBeVisible();
});

test('a nonsense helps answer stays on the question until a real one', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start with a new child' }).click();
  await send(page, 'Rowan', 'How old is Rowan');
  await send(page, '7', 'how would you describe Rowan');
  await send(page, 'He likes a quiet hello.', 'What does Rowan love');
  await send(page, 'Trains.', 'What tends to overwhelm');
  await send(page, 'Crowded doorways.', 'feel calm again');
  const answer = page.getByRole('textbox', { name: 'Your answer' });
  await answer.fill('banana purple 42');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByText('I want to make sure I understand. What usually helps Rowan settle')).toBeVisible();
  await expect(page.locator('#current-question')).toContainText('feel calm again');
  await expect(answer).toHaveValue('');
  await expect(answer).toBeEnabled();
  await expect(page.getByText('banana purple 42')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Skip' })).toHaveCount(0);
  await answer.fill('A quiet corner and a heads-up before the next song.');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByText('let you know what they need').first()).toBeVisible();
});

test('a second nonsense helps answer advances', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start with a new child' }).click();
  await send(page, 'Rowan', 'How old is Rowan');
  await send(page, '7', 'how would you describe Rowan');
  await send(page, 'He likes a quiet hello.', 'What does Rowan love');
  await send(page, 'Trains.', 'What tends to overwhelm');
  await send(page, 'Crowded doorways.', 'feel calm again');
  const answer = page.getByRole('textbox', { name: 'Your answer' });
  await answer.fill('banana purple 42');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByText('I want to make sure I understand')).toBeVisible();
  await answer.fill('asdf qwerty zebra moonlight');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByText('anything else that calms Rowan').first()).toBeVisible();
});
