import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DemoContext } from '../scripts/demo-server.ts';
import { localDemoEnabled } from '../web/lib/local-demo.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('local demo is on only for the string 1', () => {
  assert.equal(localDemoEnabled(undefined), false);
  assert.equal(localDemoEnabled('true'), false);
  assert.equal(localDemoEnabled('1'), true);
});

test('the worker entry and wrangler config do not read the local demo flag', () => {
  const wrangler = readFileSync(join(root, 'wrangler.toml'), 'utf8');
  const entry = readFileSync(join(root, 'src/index.ts'), 'utf8');
  assert.equal(wrangler.includes('READY_LOCAL_DEMO'), false);
  assert.equal(entry.includes('READY_LOCAL_DEMO'), false);
});

test('demo open rejects when the flag is off', async () => {
  await assert.rejects(DemoContext.open(undefined), { message: 'READY_LOCAL_DEMO is off' });
});

test('intake uses the typed note, then approve, then a second approve conflicts', async () => {
  const demo = await DemoContext.open('1');
  const intake = await demo.handle(
    new Request('http://example.com/v1/intake/profile', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer leaked',
      },
      body: JSON.stringify({
        preferredName: 'Rowan',
        ageYears: 7,
        sensoryNotes: 'TICK-QUIET-ROOM',
        supportNeeds: 'A quiet seat near the door.',
        whatHelps: 'A warning before music.',
        whatToAvoid: 'Surprise loud songs.',
      }),
    }),
  );
  assert.equal(intake.status, 201);
  const drafted = (await intake.json()) as {
    id: string;
    status: string;
    profile: { sensoryConsiderations: string[] };
  };
  assert.equal(drafted.status, 'draft');
  assert.equal(drafted.profile.sensoryConsiderations[0], 'TICK-QUIET-ROOM');

  const approve = await demo.handle(
    new Request(`http://example.com/v1/profiles/${drafted.id}/approve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }),
  );
  assert.equal(approve.status, 200);
  const approved = (await approve.json()) as { status: string };
  assert.equal(approved.status, 'approved');

  const again = await demo.handle(
    new Request(`http://example.com/v1/profiles/${drafted.id}/approve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }),
  );
  assert.equal(again.status, 409);
});
