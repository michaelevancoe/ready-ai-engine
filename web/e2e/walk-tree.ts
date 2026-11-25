import { expect, type APIRequestContext, type Page } from '@playwright/test';

export async function resetSavedVisit(request: APIRequestContext): Promise<void> {
  if (process.env.READY_ACCOUNT_E2E !== '1') return;
  const response = await request.post('/visit-reset');
  if (!response.ok()) throw new Error(`visit reset failed with ${response.status()}`);
}

const LONG_HELPS = 'A quiet corner and a heads-up before the next song.';
const BEHAVIOR =
  'When Rowan is very upset, does he ever hurt himself or others, or run off? If so, what helps in that moment?';

export async function answerTree(page: Page, sensory: string): Promise<void> {
  await page.getByRole('button', { name: 'Start with a new child' }).click();
  await send(page, 'He likes a quiet hello.', 'What does Rowan love');
  await send(page, 'Trains.', 'What tends to overwhelm');
  await send(page, 'Crowded doorways.', 'feel calm again');
  await send(page, LONG_HELPS, 'let you know what he needs');
  await send(page, 'Picture cards.', 'What sensory things');
  await send(page, sensory, 'need the bathroom');
  await send(page, 'Tells an adult', 'any allergies');
  await page.getByRole('button', { name: 'No known allergies' }).click();
  await expect(page.getByText(BEHAVIOR).first()).toBeVisible();
  await send(page, 'No, not usually', "Rowan's brief");
}

export async function approveBrief(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Looks right, approve' }).click();
  await expect(page.getByRole('heading', { name: 'Rowan is ready for Sunday' })).toBeVisible();
}

async function send(page: Page, text: string, next: string): Promise<void> {
  await page.getByRole('textbox', { name: 'Your answer' }).fill(text);
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByText(next).first()).toBeVisible();
}
