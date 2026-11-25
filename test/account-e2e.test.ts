import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { accountSeedSql } from '../scripts/account-e2e-sessions.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('the account seed signs in the people the local seed already stores', () => {
  const sql = accountSeedSql();
  assert.equal(sql.includes('avery.parent@example.com'), true);
  assert.equal(sql.includes('cameron.volunteer@example.com'), true);
  assert.equal(sql.includes('devon.admin@example.com'), true);
  assert.equal(sql.includes('extensions.crypt'), true);
  assert.equal(sql.includes('auth.identities'), true);
  assert.equal(sql.includes('insert into public.organizations'), false);
  assert.equal(sql.includes('insert into public.memberships'), false);
  assert.equal(sql.includes('insert into public.children'), false);
  assert.equal(sql.includes('SERVICE_ROLE'), false);
  const source = readFileSync(join(root, 'scripts/account-e2e-sessions.ts'), 'utf8');
  assert.equal(source.includes('SERVICE_ROLE'), false);
});

test('the account job stays on local supabase and ci stays keyless', () => {
  const workflow = readFileSync(join(root, '.github/workflows/access-rls.yml'), 'utf8');
  const start = workflow.indexOf('\n  account-e2e:');
  assert.notEqual(start, -1);
  const job = workflow.slice(start);
  assert.equal(job.includes('SERVICE_ROLE'), false);
  assert.equal(job.includes('supabase start'), true);
  assert.equal(job.includes("printf 'READY_LOCAL_DB_URL=%s\\n'"), true);
  assert.equal(job.includes('test:e2e:account'), true);
  const ci = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8');
  assert.equal(ci.includes('supabase'), false);
  const config = readFileSync(join(root, 'web/playwright.account.config.ts'), 'utf8');
  assert.equal(config.includes("READY_VISIT_STORE: 'account'"), true);
  assert.equal(config.includes("READY_ACCOUNT_E2E: '1'"), true);
  assert.equal(config.includes('READY_LOCAL_DB_URL'), true);
  assert.equal(config.includes('workers: 1'), true);
  const script = readFileSync(join(root, 'web/package.json'), 'utf8');
  assert.equal(script.includes('READY_ACCOUNT_E2E=1 playwright test -c playwright.account.config.ts'), true);
  assert.equal(config.includes('-u READY_VISIT_STORE'), true);
  assert.equal(config.includes('-u READY_SIGN_IN'), true);
  assert.equal(config.includes('-u READY_MODE'), true);
});
