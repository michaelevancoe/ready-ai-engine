import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DemoContext } from '../scripts/demo-engine.ts';
import { handleRequest, type AppDeps } from '../src/app.ts';
import { signInEnabled } from '../src/access.ts';
import { churchStore, testEnv } from './fixtures.ts';
import { NOINDEX, ROBOTS_TXT, dispatchDemo } from '../web/lib/public-demo.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('sign-in is on only for the string on', () => {
  assert.equal(signInEnabled(undefined), false);
  assert.equal(signInEnabled(''), false);
  assert.equal(signInEnabled('true'), false);
  assert.equal(signInEnabled('1'), false);
  assert.equal(signInEnabled('ON'), false);
  assert.equal(signInEnabled('on'), true);
});

test('the flag defaults off and the deployed demo routes stay the same', async () => {
  const worker = readFileSync(join(root, 'web/worker/index.ts'), 'utf8');
  const config = readFileSync(join(root, 'web/cloudflare.config.ts'), 'utf8');
  const wrangler = readFileSync(join(root, 'wrangler.toml'), 'utf8');
  assert.equal(worker.includes('READY_SIGN_IN'), false);
  assert.equal(config.includes('READY_SIGN_IN'), false);
  assert.equal(wrangler.includes('READY_SIGN_IN'), false);

  const demo = await DemoContext.open('1');
  const health = await demo.handle(new Request('http://example.com/healthz'));
  assert.equal(health.status, 200);
  assert.equal(await health.text(), 'ok');

  const closed = await demo.handle(new Request('http://example.com/v1/access/children/child-harbor'));
  assert.equal(closed.status, 404);
  assert.equal(await closed.text(), '{"error":"not_found"}');

  const intake = await demo.handle(
    new Request('http://example.com/v1/intake/profile', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        preferredName: 'Rowan',
        ageYears: 7,
        sensoryNotes: 'FLAG-OFF-NOTE',
        supportNeeds: 'A quiet seat near the door.',
        whatHelps: 'A warning before music.',
        whatToAvoid: 'Surprise loud songs.',
      }),
    }),
  );
  assert.equal(intake.status, 201);
  const drafted = (await intake.json()) as { status: string; profile: { sensoryConsiderations: string[] } };
  assert.equal(drafted.status, 'draft');
  assert.equal(drafted.profile.sensoryConsiderations[0], 'FLAG-OFF-NOTE');

  const robots = await dispatchDemo(new Request('https://example.com/robots.txt'), {
    page: async () => new Response('page', { status: 200 }),
    engine: async () => new Response('engine', { status: 200 }),
  });
  assert.equal(robots.status, 200);
  assert.equal(robots.headers.get('X-Robots-Tag'), NOINDEX);
  assert.equal(await robots.text(), ROBOTS_TXT);
});

test('access routes stay closed when the flag is off, even with a populated world', async () => {
  const world = {
    sessions: [{ sessionId: 'user-parent-harbor', userId: 'user-parent-harbor' }],
    memberships: [{ userId: 'user-parent-harbor', organizationId: 'org-harbor', role: 'parent' as const }],
    children: [
      {
        id: 'child-harbor',
        organizationId: 'org-harbor',
        parentUserId: 'user-parent-harbor',
        displayName: 'HARBOR-CHILD',
      },
    ],
    assignments: [],
    briefs: [],
    churches: [{ organizationId: 'org-harbor', name: 'HARBOR-CHURCH' }],
    lessons: [],
    medicalGrants: [],
    invites: [],
  };
  const base: AppDeps = {
    env: testEnv,
    fetch: async () => new Response(null, { status: 500 }),
    storeFactory: () => churchStore(),
    log: () => undefined,
    accessWorld: world,
  };
  const closed = await handleRequest(
    new Request('https://example.com/v1/access/children/child-harbor', {
      headers: { authorization: 'Bearer user-parent-harbor' },
    }),
    base,
  );
  const unknown = await handleRequest(new Request('https://example.com/v1/no-such'), base);
  const closedText = await closed.text();
  const unknownText = await unknown.text();
  assert.equal(closed.status, unknown.status);
  assert.equal(closedText, unknownText);
  assert.equal(closedText.includes('HARBOR-CHILD'), false);

  const misconfigured = await handleRequest(
    new Request('https://example.com/v1/access/children/child-harbor', {
      headers: { authorization: 'Bearer user-parent-harbor' },
    }),
    { ...base, accessWorld: undefined, env: { ...testEnv, READY_SIGN_IN: 'on' } },
  );
  assert.equal(misconfigured.status, 500);
  assert.deepEqual(await misconfigured.json(), { error: 'misconfigured' });
});
