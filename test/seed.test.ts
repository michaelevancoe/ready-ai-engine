import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { churchStore, ids } from './fixtures.ts';

const seed = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../supabase/seed.sql'),
  'utf8',
);

test('seed is a fictional demo church with a draft and an approved profile', () => {
  assert.match(seed, /Fictional demo data/);
  assert.match(seed, /Example Harbor Fellowship/);
  assert.match(seed, /Rowan Sampleton/);
  assert.match(seed, /Quinn Placeholder/);
  assert.match(seed, /'draft'/);
  assert.match(seed, /'approved'/);
  assert.match(seed, /'volunteer'/);
  assert.match(seed, /'parent'/);
  assert.match(seed, /'leader'/);
  assert.doesNotMatch(seed, /'admin'/);
});

test('Devon is a leader in the demo church', async () => {
  const membership = await churchStore().getMembership(ids.devon, ids.org);
  assert.equal(membership?.role, 'leader');
});

test('seed email addresses stay on example.com', () => {
  const emails = seed.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? [];
  assert.ok(emails.length >= 4);
  for (const email of emails) assert.match(email, /@example\.com$/);
});
