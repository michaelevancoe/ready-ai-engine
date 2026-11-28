import { expect, test, type Page, type Route } from '@playwright/test';
import { answerTree, approveBrief } from './walk-tree';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('the story wait stays inside the card until the story arrives', async ({ page }) => {
  const gate = hold(page, '/v1/drafts/social-story');
  await page.getByRole('button', { name: /Rowan, 7/ }).click();
  await page.getByRole('button', { name: "Read Rowan's story" }).click();
  const status = page.locator('article.story-card').getByRole('status');
  await expect(status).toHaveText("Writing Rowan's story…");
  gate.release();
  await expect(status).toBeHidden();
  await expect(page.getByRole('region', { name: 'My Sunday schedule' })).toBeVisible();
});

test('an acknowledgement wait stays inside the card until the reply arrives', async ({ page }) => {
  const gate = hold(page, '/v1/drafts/acknowledgement');
  await page.getByRole('button', { name: 'Start with a new child' }).click();
  await send(page, 'Juniper', 'How old is Juniper');
  await send(page, '7', 'how would you describe Juniper');
  await send(page, 'Juniper likes quiet corners and picture cards.', null);
  const status = page.locator('article.story-card').getByRole('status');
  await expect(status).toHaveText('Ready is reading your answer...');
  gate.release();
  await expect(status).toBeHidden();
  await expect(page.getByText('What does Juniper love').first()).toBeVisible();
});

test('the summary and the leader draft each wait inside a card', async ({ page }) => {
  test.setTimeout(120_000);
  const summary = hold(page, '/v1/intake/profile');
  await answerTree(page, 'Bright lights.');
  const summaryStatus = page.locator('article.what-helps').getByRole('status');
  await expect(summaryStatus).toHaveText("Writing Rowan's summary…");
  summary.release();
  await expect(summaryStatus).toBeHidden();
  await expect(page.locator('article.what-helps li').first()).toBeVisible();

  await approveBrief(page);
  await page.getByRole('link', { name: 'Volunteer' }).click();
  await page.getByRole('button', { name: 'Open Rowan, 7, Brief ready' }).click();
  await page.getByLabel('Notes after Sunday').fill('Rowan liked the quiet corner.');
  await page.getByRole('button', { name: 'Save notes' }).click();

  const draft = hold(page, '/v1/drafts/sunday-update');
  await page.getByRole('link', { name: 'Leader' }).click();
  await page.getByRole('button', { name: /Rowan, 7\s+Ready to draft/ }).click();
  await page.getByRole('button', { name: "Draft a note for Rowan's parent", exact: true }).click();
  const draftStatus = page.locator('article.story-card').getByRole('status');
  await expect(draftStatus).toHaveText('Writing the draft.');
  draft.release();
  await expect(draftStatus).toBeHidden();
  await expect(page.getByRole('textbox', { name: 'Parent note' })).toHaveValue(/Sunday went well for Rowan/);
});

function hold(page: Page, fragment: string): { release: () => void } {
  let release = (): void => {};
  const opened = new Promise<void>((resolve) => {
    release = resolve;
  });
  void page.route(`**${fragment}`, async (route: Route) => {
    await opened;
    await route.continue();
  });
  return { release };
}

async function send(page: Page, text: string, next: string | null): Promise<void> {
  await page.getByRole('textbox', { name: 'Your answer' }).fill(text);
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  if (next !== null) await expect(page.getByText(next).first()).toBeVisible();
}
