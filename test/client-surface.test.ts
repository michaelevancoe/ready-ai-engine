import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { dirname } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { FICTIONAL_DATA_LABEL } from '../web/lib/fictional-label.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const clientFiles = [
  'web/app/page.tsx',
  'web/app/layout.tsx',
  'web/app/visit-shell.tsx',
  'web/app/volunteer/page.tsx',
  'web/app/leader/page.tsx',
  'web/lib/desk.ts',
  'web/lib/drafts.ts',
  'web/lib/fictional-label.ts',
  'web/lib/local-demo.ts',
  'web/lib/visit.ts',
];

test('the shell shows the fictional-data label', () => {
  const shell = readFileSync(join(root, 'web/app/visit-shell.tsx'), 'utf8');
  assert.equal(shell.includes('FICTIONAL_DATA_LABEL'), true);
  assert.equal(FICTIONAL_DATA_LABEL.includes('fictional data only'), true);
  assert.equal(FICTIONAL_DATA_LABEL.includes('real child'), true);
});

test('client demo files do not name gateway secrets or account ids', () => {
  const banned = ['AI_GATEWAY', 'NEXT_PUBLIC_', 'SUPABASE_', 'cf-aig-authorization'];
  for (const rel of clientFiles) {
    const text = readFileSync(join(root, rel), 'utf8');
    for (const needle of banned) {
      assert.equal(text.includes(needle), false, `${rel} contains ${needle}`);
    }
  }
  const libDir = join(root, 'web/lib');
  for (const entry of readdirSync(libDir)) {
    const path = join(libDir, entry);
    if (!statSync(path).isFile()) continue;
    if (!entry.endsWith('.ts')) continue;
    const text = readFileSync(path, 'utf8');
    assert.equal(text.includes('NEXT_PUBLIC_'), false, entry);
  }
});
