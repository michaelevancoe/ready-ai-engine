import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sql = readFileSync(join(root, 'supabase/migrations/20261125120000_account_visit.sql'), 'utf8');

function policy(name: string): string {
  const match = new RegExp(`create policy ${name}([\\s\\S]*?);`).exec(sql);
  assert.ok(match?.[1], `missing policy ${name}`);
  return match[1];
}

function fn(name: string): string {
  const match = new RegExp(`create or replace function public\\.${name}[\\s\\S]*?\\$\\$;`).exec(sql);
  assert.ok(match?.[0], `missing function ${name}`);
  return match[0];
}

function table(name: string): string {
  const match = new RegExp(`create table public\\.${name} \\(([\\s\\S]*?)\\n\\);`).exec(sql);
  assert.ok(match?.[1], `missing table ${name}`);
  return match[1];
}

test('the new migration wraps every auth.uid call and is not wide open', () => {
  const wrapped = sql.match(/\(select auth\.uid\(\)\)/g) ?? [];
  const calls = sql.match(/auth\.uid\(\)/g) ?? [];
  assert.ok(wrapped.length > 0);
  assert.equal(calls.length, wrapped.length);
  assert.doesNotMatch(sql, /using \(true\)/i);
  assert.doesNotMatch(sql, /with check \(true\)/i);
  assert.doesNotMatch(sql, /service_role/);
  assert.doesNotMatch(sql, /to anon/);
  assert.doesNotMatch(sql, /grant [^;]* to public/);
});

test('draft select is the leader or the child parent', () => {
  assert.match(sql, /drop policy child_profiles_select_draft on public\.child_profiles/);
  const draft = policy('child_profiles_select_draft');
  assert.match(draft, /status = 'draft'/);
  assert.match(draft, /= 'leader'/);
  assert.match(draft, /= 'parent'/);
  assert.match(draft, /parent_user_id = \(select auth\.uid\(\)\)/);
  assert.doesNotMatch(draft, /'admin'/);
  assert.doesNotMatch(draft, /volunteer/);
});

test('live policies that inlined auth.uid are recreated with the wrapper', () => {
  const names = [
    'child_profiles_insert_draft',
    'child_profiles_update_parent',
    'children_select_own_parent',
    'child_profiles_select_approved_parent',
    'medical_grants_select_parent',
    'medical_grants_insert_parent',
    'medical_grants_update_parent',
    'rooms_select_scoped',
    'sundays_select_scoped',
    'volunteer_assignments_select_scoped',
  ];
  for (const name of names) {
    assert.match(sql, new RegExp(`drop policy ${name} on public\\.`));
    assert.match(policy(name), /\(select auth\.uid\(\)\)/);
  }
});

test('admin memberships become leader and the profile trigger is not executable', () => {
  assert.match(sql, /update public\.memberships set role = 'leader' where role = 'admin'/);
  assert.match(
    sql,
    /revoke all on function public\.protect_child_profile\(\) from public, anon, authenticated/,
  );
  assert.doesNotMatch(sql, /grant execute on function public\.protect_child_profile/);
});

test('invites expire after seven days and the caller cannot pass an expiry', () => {
  assert.match(
    sql,
    /add column expires_at timestamptz not null default \(now\(\) \+ interval '7 days'\)/,
  );
  const create = fn('create_invite');
  assert.match(create, /function public\.create_invite\(target_org uuid, invite_role text\)/);
  assert.match(create, /set search_path = pg_catalog, public/);
  assert.match(create, /expires_at/);
  assert.match(create, /now\(\) \+ interval '7 days'/);
  assert.doesNotMatch(create, /expires_at timestamptz/);

  const accept = fn('accept_invite');
  assert.match(accept, /function public\.accept_invite\(invite_id uuid, claimed_role text default null\)/);
  assert.match(accept, /set search_path = pg_catalog, public/);
  assert.match(accept, /invite_expires <= now\(\)/);
  assert.match(accept, /raise exception 'not_found'/);

  assert.match(sql, /revoke all on function public\.create_invite\(uuid, text\) from public, anon, authenticated/);
  assert.match(sql, /revoke all on function public\.accept_invite\(uuid, text\) from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.create_invite\(uuid, text\) to authenticated/);
  assert.match(sql, /grant execute on function public\.accept_invite\(uuid, text\) to authenticated/);
});

test('visit rows keep one owner and lessons stay one approved row per organization', () => {
  const answers = table('intake_answers');
  assert.match(answers, /primary key \(organization_id, child_id\)/);
  assert.match(answers, /user_id uuid not null/);
  assert.match(answers, /answers jsonb not null/);

  const brief = table('parent_briefs');
  assert.match(brief, /child_id uuid primary key/);
  assert.match(brief, /card_touched boolean not null/);
  for (const column of [
    'loves',
    'overwhelms',
    'what_helps',
    'communication',
    'sensory',
    'toileting',
    'allergies',
    'calming',
    'medical',
  ]) {
    assert.match(brief, new RegExp(`${column} text not null`));
    assert.match(brief, new RegExp(`show_${column} boolean not null`));
  }

  const publication = table('brief_publications');
  assert.match(publication, /primary key \(organization_id, child_id\)/);
  assert.match(publication, /lines jsonb not null/);
  assert.match(sql, /brief_publications_lines_no_medical/);
  assert.match(sql, /not \(lines @> '\[\{"field":"medical"\}\]'::jsonb\)/);

  const notes = table('volunteer_notes');
  assert.match(notes, /primary key \(user_id, child_id\)/);
  assert.match(notes, /body text not null/);

  const update = table('sunday_updates');
  assert.match(update, /child_id uuid primary key/);
  assert.match(update, /author_user_id uuid not null/);
  assert.match(update, /check \(status = 'approved'\)/);

  assert.match(sql, /add column source text not null default ''/);
  assert.match(sql, /add column summary text not null default ''/);
  assert.match(sql, /add column steps jsonb not null default '\[\]'::jsonb/);
  assert.match(sql, /add column status text not null default 'approved'/);
  assert.match(sql, /add column author_user_id uuid/);
  assert.match(sql, /lessons_organization_unique unique \(organization_id\)/);
  assert.match(sql, /lessons_status_check check \(status = 'approved'\)/);

  for (const name of [
    'intake_answers',
    'parent_briefs',
    'brief_publications',
    'volunteer_notes',
    'sunday_updates',
  ]) {
    assert.match(sql, new RegExp(`alter table public\\.${name} enable row level security`));
    assert.match(sql, new RegExp(`alter table public\\.${name} force row level security`));
  }

  assert.match(policy('church_setup_insert_leader'), /= 'leader'/);
  assert.match(policy('church_setup_update_leader'), /= 'leader'/);
  const lesson = policy('lessons_insert_leader');
  assert.match(lesson, /status = 'approved'/);
  assert.match(lesson, /author_user_id = \(select auth\.uid\(\)\)/);
  assert.match(lesson, /= 'leader'/);
  const parentUpdate = policy('sunday_updates_select_parent');
  assert.match(parentUpdate, /status = 'approved'/);
  assert.match(parentUpdate, /= 'parent'/);
  assert.match(parentUpdate, /parent_user_id = \(select auth\.uid\(\)\)/);
  assert.match(policy('volunteer_notes_insert_owner'), /= 'volunteer'/);
  assert.match(policy('intake_answers_insert_parent'), /user_id = \(select auth\.uid\(\)\)/);
  assert.match(policy('intake_answers_insert_parent'), /= 'parent'/);
});
