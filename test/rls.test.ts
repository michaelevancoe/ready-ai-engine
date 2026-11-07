import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sql = readFileSync(join(root, 'supabase/migrations/20261107120000_intake_profile.sql'), 'utf8');

function policy(name: string): string {
  const match = new RegExp(`create policy ${name}([\\s\\S]*?);`, 'i').exec(sql);
  assert.ok(match?.[1], `missing policy ${name}`);
  return match[1];
}

test('row level security is forced on every tenant table', () => {
  for (const table of ['organizations', 'memberships', 'children', 'child_profiles']) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(sql, new RegExp(`alter table public\\.${table} force row level security`));
  }
});

test('roles and profile status are constrained', () => {
  assert.match(sql, /check \(role in \('admin', 'parent', 'volunteer'\)\)/);
  assert.match(sql, /check \(status in \('draft', 'approved'\)\)/);
  assert.match(sql, /parent_user_id uuid not null/);
});

test('draft select is admin or the child parent, and never names volunteers', () => {
  const draft = policy('child_profiles_select_draft');
  assert.match(draft, /status = 'draft'/);
  assert.match(draft, /= 'admin'/);
  assert.match(draft, /= 'parent'/);
  assert.match(draft, /parent_user_id = auth\.uid\(\)/);
  assert.doesNotMatch(draft, /volunteer/);

  const approved = policy('child_profiles_select_approved');
  assert.match(approved, /status = 'approved'/);
  assert.match(approved, /current_membership_role\(organization_id\) is not null/);
  assert.doesNotMatch(approved, /volunteer/);
});

test('only the child parent can insert a draft or approve it', () => {
  const insert = policy('child_profiles_insert_draft');
  assert.match(insert, /status = 'draft'/);
  assert.match(insert, /created_by = auth\.uid\(\)/);
  assert.match(insert, /= 'parent'/);
  assert.match(insert, /parent_user_id = auth\.uid\(\)/);
  assert.doesNotMatch(insert, /volunteer/);
  assert.doesNotMatch(insert, /'admin'/);

  const update = policy('child_profiles_update_parent');
  assert.match(update, /status = 'draft'/);
  assert.match(update, /status = 'approved'/);
  assert.match(update, /= 'parent'/);
  assert.match(update, /approved_by = auth\.uid\(\)/);
  assert.match(update, /parent_user_id = auth\.uid\(\)/);
  assert.doesNotMatch(update, /volunteer/);
  assert.doesNotMatch(update, /'admin'/);
});

test('policies are not wide open', () => {
  assert.doesNotMatch(sql, /using \(true\)/i);
  assert.doesNotMatch(sql, /with check \(true\)/i);
});
