import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const enabled = process.env.READY_LOCAL_SUPABASE === '1';
const hosted = ['supabase', 'co'].join('.');

test('the database denies cross-child register, other roles, and unscoped room reads', { skip: !enabled }, () => {
  const dbUrl = process.env.READY_LOCAL_DB_URL;
  assert.equal(typeof dbUrl, 'string');
  assert.equal(dbUrl?.includes(hosted), false);
  const result = spawnSync(
    'psql',
    [dbUrl ?? '', '-v', 'ON_ERROR_STOP=1', '-f', join(root, 'test/access-rls.sql')],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
});
