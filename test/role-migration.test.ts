import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrationName = '20261124120000_role_sign_in.sql';
const sql = readFileSync(join(root, 'supabase/migrations', migrationName), 'utf8');

function fn(name: string): string {
  const match = new RegExp(`create or replace function public\\.${name}[\\s\\S]*?\\$\\$;`).exec(sql);
  assert.ok(match?.[0], `missing function ${name}`);
  return match[0];
}

function policy(name: string): string {
  const match = new RegExp(`create policy ${name}([\\s\\S]*?);`).exec(sql);
  assert.ok(match?.[1], `missing policy ${name}`);
  return match[1];
}

test('the sign-in migration is a file only and scripts do not apply it', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
  const web = JSON.parse(readFileSync(join(root, 'web/package.json'), 'utf8')) as { scripts: Record<string, string> };
  const scripts = JSON.stringify({ ...pkg.scripts, ...web.scripts });
  assert.equal(scripts.includes('supabase'), false);
  const workflows = readdirSync(join(root, '.github/workflows'));
  for (const name of workflows) {
    const text = readFileSync(join(root, '.github/workflows', name), 'utf8');
    assert.equal(text.includes(migrationName), false);
    assert.equal(text.includes('db push'), false);
    assert.equal(text.includes('service_role'), false);
    if (name === 'access-rls.yml') continue;
    assert.equal(text.includes('supabase'), false);
  }
  const hits: string[] = [];
  const skip = new Set([
    'node_modules',
    '.git',
    'dist',
    '.next',
    '.cloudflare',
    '.temp',
    '.branches',
    'coverage',
    'playwright-report',
    'test-results',
  ]);
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      if (skip.has(entry)) continue;
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      if (path.endsWith(migrationName) || path.endsWith('test/role-migration.test.ts')) continue;
      if (readFileSync(path, 'utf8').includes(migrationName)) hits.push(path);
    }
  };
  walk(root);
  assert.deepEqual(hits, []);
});

test('leader is added beside the existing roles, and invites cannot name a parent or admin', () => {
  assert.match(sql, /check \(role in \('admin', 'parent', 'volunteer', 'leader'\)\)/);
  assert.match(sql, /constraint invitations_role_check check \(role in \('volunteer', 'leader'\)\)/);
  assert.doesNotMatch(sql, /@/);
});

test('children and approved profiles are limited to that child parent', () => {
  assert.match(sql, /drop policy children_select_member on public\.children/);
  const children = policy('children_select_own_parent');
  assert.match(children, /parent_user_id = auth\.uid\(\)/);
  assert.match(children, /= 'parent'/);

  assert.match(sql, /drop policy child_profiles_select_approved on public\.child_profiles/);
  const approved = policy('child_profiles_select_approved_parent');
  assert.match(approved, /status = 'approved'/);
  assert.match(approved, /= 'parent'/);
  assert.match(approved, /parent_user_id = auth\.uid\(\)/);
  assert.doesNotMatch(approved, /volunteer/);
});

test('a volunteer brief matches room and Sunday, and medical defaults off', () => {
  const cover = fn('volunteer_covers_brief');
  assert.match(cover, /a\.room_id = b\.room_id/);
  assert.match(cover, /a\.sunday_id = b\.sunday_id/);
  assert.match(cover, /a\.user_id = auth\.uid\(\)/);
  assert.match(cover, /b\.shared = true/);
  assert.match(policy('shared_briefs_select_assigned'), /volunteer_covers_brief\(id\)/);

  assert.match(sql, /granted boolean not null default false/);
  const medical = fn('medical_visible');
  assert.match(medical, /g\.granted = true/);
  assert.match(medical, /a\.room_id = b\.room_id/);
  assert.match(medical, /a\.sunday_id = b\.sunday_id/);
  assert.match(medical, /c\.parent_user_id = auth\.uid\(\)/);
  const insert = policy('medical_grants_insert_parent');
  assert.match(insert, /= 'parent'/);
  assert.match(insert, /parent_user_id = auth\.uid\(\)/);
  assert.doesNotMatch(insert, /volunteer/);
});

test('church setup and lessons are visible to that church leader', () => {
  assert.match(policy('church_setup_select_leader'), /= 'leader'/);
  assert.match(policy('lessons_select_leader'), /= 'leader'/);
  for (const table of [
    'rooms',
    'sundays',
    'volunteer_assignments',
    'shared_briefs',
    'medical_grants',
    'medical_notes',
    'church_setup',
    'lessons',
    'invitations',
  ]) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(sql, new RegExp(`alter table public\\.${table} force row level security`));
  }
  assert.doesNotMatch(sql, /using \(true\)/i);
  assert.doesNotMatch(sql, /with check \(true\)/i);
});

test('self-register and accept-invite have no role argument that could escalate', () => {
  const register = fn('self_register_parent');
  assert.match(register, /function public\.self_register_parent\(target_org uuid\)/);
  assert.match(register, /values \(target_org, auth\.uid\(\), 'parent'\)/);
  assert.match(register, /raise exception 'forbidden'/);
  assert.doesNotMatch(register, /invite_role/);

  const create = fn('create_invite');
  assert.match(create, /is distinct from 'leader'/);
  assert.match(create, /invite_role not in \('volunteer', 'leader'\)/);

  const accept = fn('accept_invite');
  assert.match(accept, /function public\.accept_invite\(invite_id uuid\)/);
  assert.match(accept, /values \(invite_org, auth\.uid\(\), invite_role\)/);
  assert.doesNotMatch(accept, /requested/);
  assert.doesNotMatch(sql, /grant insert on table public\.memberships/);
});
