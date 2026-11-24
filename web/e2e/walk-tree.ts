import { expect, type Page } from '@playwright/test';

const LONG_HELPS = 'A quiet corner and a heads-up before the next song.';

export async function answerTree(page: Page, sensory: string, medical?: string): Promise<void> {
  await send(page, 'He likes a quiet hello.', 'What does Rowan love');
  await send(page, 'Trains.', 'What tends to overwhelm');
  await send(page, 'Crowded doorways.', 'what helps most');
  await send(page, LONG_HELPS, 'How does Rowan communicate');
  await send(page, 'Picture cards.', 'What sensory things');
  await send(page, sensory, 'Would you like to share medical info');
  if (medical === undefined) {
    await page.getByRole('button', { name: 'Skip for now' }).click();
  } else {
    await page.getByRole('button', { name: 'Yes, add medical info' }).click();
    await send(page, medical, "Ready drafts Rowan's profile");
  }
  await expect(page.getByRole('heading', { name: "Ready drafts Rowan's profile" })).toBeVisible();
}

export async function reviewProfile(page: Page): Promise<void> {
  await page.getByRole('button', { name: "Review Rowan's profile" }).click();
}

async function send(page: Page, text: string, next: string): Promise<void> {
  await page.getByRole('textbox', { name: 'Your answer' }).fill(text);
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByText(next).first()).toBeVisible();
}
