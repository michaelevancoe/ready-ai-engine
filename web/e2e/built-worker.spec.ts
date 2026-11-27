import { expect, test } from '@playwright/test';
import { answerTree } from './walk-tree';

test('a new question is announced after send', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start with a new child' }).click();
  const log = page.getByRole('log', { name: 'Conversation' });
  await expect(log).toHaveAttribute('aria-live', 'polite');
  const answer = page.getByRole('textbox', { name: 'Your answer' });
  await expect(answer).toHaveAttribute('aria-describedby', 'current-question');
  await expect(page.locator('#current-question')).toContainText('What name does your child go by at church?');
  await answer.fill('Rowan');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.locator('#current-question')).toContainText('How old is Rowan');
});

test('the built page hydrates and submits intake without a GET navigation', async ({ page }) => {
  const robots = await page.request.get('/robots.txt');
  expect(robots.status()).toBe(200);
  expect(robots.headers()['x-robots-tag']).toBe('noindex');
  expect(await robots.text()).toBe('User-agent: *\nDisallow: /\n');

  const root = await page.request.get('/');
  expect(root.status()).toBe(200);
  expect(root.headers()['x-robots-tag']).toBe('noindex');
  const html = await root.text();
  const cssPath = html.match(/href="(\/_next\/static\/css\/[^"]+)"/)?.[1];
  expect(cssPath).toEqual(expect.any(String));
  const css = await page.request.get(cssPath ?? '');
  expect(css.status()).toBe(200);
  expect(css.headers()['content-type'] ?? '').toContain('text/css');
  expect(css.headers()['x-robots-tag']).toBe('noindex');

  const rejected = await page.request.post('/v1/intake/profile', {
    data: {},
    headers: { 'content-type': 'application/json' },
  });
  expect(rejected.status()).toBe(400);
  expect(rejected.headers()['content-type'] ?? '').toContain('application/json');
  expect(rejected.headers()['x-robots-tag']).toBe('noindex');

  const posted = page.waitForRequest(
    (request) => request.method() === 'POST' && request.url().includes('/v1/intake/profile'),
  );
  await page.goto('/');
  await answerTree(page, 'TICK-QUIET-ROOM');
  const request = await posted;
  await page.getByRole('button', { name: 'Looks right, approve' }).click();
  expect(request.postDataJSON()).toMatchObject({
    sensoryNotes: 'TICK-QUIET-ROOM.',
    preferredName: 'Rowan',
    ageYears: 7,
  });
  await expect(page.getByRole('heading', { name: 'Rowan is ready for Sunday' })).toBeVisible();
  expect(new URL(page.url()).search).toBe('');
});
