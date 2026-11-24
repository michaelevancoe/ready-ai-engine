import { expect, test } from '@playwright/test';
import { answerTree, reviewProfile } from './walk-tree';

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

  await page.goto('/');
  const posted = page.waitForRequest(
    (request) => request.method() === 'POST' && request.url().includes('/v1/intake/profile'),
  );
  await answerTree(page, 'TICK-QUIET-ROOM');
  const request = await posted;
  expect(request.postDataJSON()).toMatchObject({ sensoryNotes: 'TICK-QUIET-ROOM', preferredName: 'Rowan', ageYears: 7 });
  await reviewProfile(page);
  await expect(page.getByRole('region', { name: 'Sensory considerations' })).toContainText('TICK-QUIET-ROOM');
  expect(new URL(page.url()).search).toBe('');
});
