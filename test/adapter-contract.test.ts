import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import type { AccessCommand, AccessResult, ChurchRole } from '../src/access.ts';
import { isUuid } from '../src/ids.ts';
import { memoryAccessSource, type MemoryAccessWorld } from '../src/memory-access.ts';
import { MemoryStore } from '../src/memory-store.ts';
import type { ProfileStore } from '../src/store.ts';
import { supabaseAccessSource, type AccessSource } from '../src/supabase-access.ts';
import { SupabaseStore } from '../src/supabase-store.ts';
import { sampleProfile } from './fixtures.ts';

const CHILD_NAME = 'Rowan Sampleton';
const CHURCH_NAME = 'Example Harbor Fellowship';
const LESSON_TITLE = 'A quiet welcome';
const BRIEF_TEXT = 'quiet corner';
const HIDDEN_LINE = 'must not leak';
const MEDICAL_NOTE = 'Fictional note kept off the brief until a parent grants it.';
const hosted = ['supabase', 'co'].join('.');

interface Actors {
  parent: string;
  volunteer: string;
  leader: string;
  outsider: string;
  guest: string;
  joiner: string;
  org: string;
  child: string;
  brief: string;
  lesson: string;
  room: string;
  sunday: string;
}

interface Harness {
  access(userId: string): AccessSource;
  store(userId: string): ProfileStore;
  actors: Actors;
}

function uuid(): string {
  return crypto.randomUUID();
}

function actors(): Actors {
  return {
    parent: uuid(),
    volunteer: uuid(),
    leader: uuid(),
    outsider: uuid(),
    guest: uuid(),
    joiner: uuid(),
    org: uuid(),
    child: uuid(),
    brief: uuid(),
    lesson: uuid(),
    room: uuid(),
    sunday: uuid(),
  };
}

function worldFor(ids: Actors): MemoryAccessWorld {
  return {
    organizations: [{ id: ids.org }],
    memberships: [
      { userId: ids.parent, organizationId: ids.org, role: 'parent' },
      { userId: ids.volunteer, organizationId: ids.org, role: 'volunteer' },
      { userId: ids.leader, organizationId: ids.org, role: 'leader' },
    ],
    children: [
      {
        id: ids.child,
        organizationId: ids.org,
        parentUserId: ids.parent,
        displayName: CHILD_NAME,
      },
    ],
    assignments: [
      {
        userId: ids.volunteer,
        organizationId: ids.org,
        roomId: ids.room,
        sundayId: ids.sunday,
      },
    ],
    briefs: [
      {
        id: ids.brief,
        organizationId: ids.org,
        childId: ids.child,
        roomId: ids.room,
        sundayId: ids.sunday,
        shared: true,
        lines: [
          { field: 'loves', text: BRIEF_TEXT },
          { field: 'medical', text: HIDDEN_LINE },
        ],
      },
    ],
    churches: [{ organizationId: ids.org, name: CHURCH_NAME }],
    lessons: [{ id: ids.lesson, organizationId: ids.org, title: LESSON_TITLE }],
    medicalGrants: [],
    medicalNotes: [{ childId: ids.child, note: MEDICAL_NOTE }],
    invites: [],
  };
}

function memoryStore(world: MemoryAccessWorld): MemoryStore {
  const store = new MemoryStore();
  for (const membership of world.memberships) {
    switch (membership.role) {
      case 'parent':
      case 'volunteer':
        store.memberships.push({
          organizationId: membership.organizationId,
          userId: membership.userId,
          role: membership.role,
        });
        break;
      case 'leader':
        break;
      default: {
        const leftover: never = membership.role;
        throw new Error(String(leftover));
      }
    }
  }
  for (const child of world.children) store.children.set(child.id, child);
  return store;
}

async function call(
  source: AccessSource,
  userId: string,
  command: AccessCommand,
): Promise<AccessResult> {
  return source.run({ userId, accessToken: userId, command });
}

function linesOf(result: AccessResult): { field: string; text: string }[] {
  assert.equal(result.status, 200);
  assert.ok('lines' in result.body);
  return result.body.lines;
}

async function runContract(harness: Harness): Promise<void> {
  const { actors: ids } = harness;
  const parent = harness.access(ids.parent);
  const volunteer = harness.access(ids.volunteer);
  const leader = harness.access(ids.leader);
  const outsider = harness.access(ids.outsider);
  const guest = harness.access(ids.guest);
  const joiner = harness.access(ids.joiner);

  assert.deepEqual(await call(parent, ids.parent, { type: 'membership' }), {
    status: 200,
    body: { role: 'parent' satisfies ChurchRole },
  });
  assert.deepEqual(await call(outsider, ids.outsider, { type: 'membership' }), {
    status: 404,
    body: { error: 'not_found' },
  });

  assert.deepEqual(await call(parent, ids.parent, { type: 'child', childId: ids.child }), {
    status: 200,
    body: { id: ids.child, displayName: CHILD_NAME },
  });
  assert.equal((await call(volunteer, ids.volunteer, { type: 'child', childId: ids.child })).status, 404);
  assert.equal((await call(leader, ids.leader, { type: 'child', childId: ids.child })).status, 404);
  assert.equal((await call(outsider, ids.outsider, { type: 'child', childId: ids.child })).status, 404);

  const before = linesOf(await call(volunteer, ids.volunteer, { type: 'brief', briefId: ids.brief }));
  assert.deepEqual(before, [{ field: 'loves', text: BRIEF_TEXT }]);
  assert.equal((await call(parent, ids.parent, { type: 'brief', briefId: ids.brief })).status, 404);
  assert.equal((await call(leader, ids.leader, { type: 'brief', briefId: ids.brief })).status, 404);

  assert.deepEqual(await call(leader, ids.leader, { type: 'church', organizationId: ids.org }), {
    status: 200,
    body: { organizationId: ids.org, name: CHURCH_NAME },
  });
  assert.equal((await call(volunteer, ids.volunteer, { type: 'church', organizationId: ids.org })).status, 404);
  assert.deepEqual(await call(leader, ids.leader, { type: 'lesson', lessonId: ids.lesson }), {
    status: 200,
    body: { id: ids.lesson, title: LESSON_TITLE },
  });
  assert.equal((await call(parent, ids.parent, { type: 'lesson', lessonId: ids.lesson })).status, 404);

  assert.equal((await call(volunteer, ids.volunteer, { type: 'grant', childId: ids.child })).status, 403);
  assert.deepEqual(await call(parent, ids.parent, { type: 'grant', childId: ids.child }), {
    status: 200,
    body: { granted: true },
  });
  const after = linesOf(await call(volunteer, ids.volunteer, { type: 'brief', briefId: ids.brief }));
  assert.deepEqual(after, [
    { field: 'loves', text: BRIEF_TEXT },
    { field: 'medical', text: MEDICAL_NOTE },
  ]);

  assert.deepEqual(
    await call(guest, ids.guest, { type: 'register', organizationId: ids.org, requestedRole: 'parent' }),
    { status: 201, body: { role: 'parent' } },
  );
  assert.deepEqual(
    await call(guest, ids.guest, { type: 'register', organizationId: ids.org, requestedRole: 'parent' }),
    { status: 200, body: { role: 'parent' } },
  );
  assert.equal(
    (await call(leader, ids.leader, { type: 'register', organizationId: ids.org, requestedRole: 'volunteer' })).status,
    403,
  );
  assert.equal(
    (await call(parent, ids.parent, { type: 'invite', organizationId: ids.org, requestedRole: 'volunteer' })).status,
    403,
  );
  const invite = await call(leader, ids.leader, {
    type: 'invite',
    organizationId: ids.org,
    requestedRole: 'volunteer',
  });
  assert.equal(invite.status, 201);
  assert.ok('id' in invite.body && 'role' in invite.body);
  assert.equal(invite.body.role, 'volunteer');
  assert.equal(isUuid(invite.body.id), true);
  assert.deepEqual(await call(joiner, ids.joiner, { type: 'accept', inviteId: invite.body.id, claimedRole: null }), {
    status: 201,
    body: { role: 'volunteer' },
  });
  assert.deepEqual(await call(joiner, ids.joiner, { type: 'membership' }), {
    status: 200,
    body: { role: 'volunteer' },
  });

  const parentStore = harness.store(ids.parent);
  assert.equal((await parentStore.getMembership(ids.parent, ids.org))?.role, 'parent');
  assert.equal((await parentStore.getChild(ids.child))?.displayName, CHILD_NAME);
  const draft = await parentStore.insertDraft({
    organizationId: ids.org,
    childId: ids.child,
    profile: sampleProfile(),
    createdBy: ids.parent,
  });
  assert.equal(draft.status, 'draft');
  assert.equal((await parentStore.getProfile(draft.id))?.status, 'draft');
  const approved = await parentStore.approveProfile({ profileId: draft.id, approvedBy: ids.parent });
  assert.equal(approved?.status, 'approved');
  assert.equal(approved?.approvedBy, ids.parent);
  assert.equal(await parentStore.approveProfile({ profileId: draft.id, approvedBy: ids.parent }), null);
  const volunteerStore = harness.store(ids.volunteer);
  assert.equal((await volunteerStore.getMembership(ids.volunteer, ids.org))?.role, 'volunteer');
}

test('the memory adapter passes the store contract', async () => {
  const ids = actors();
  const world = worldFor(ids);
  const store = memoryStore(world);
  await runContract({
    actors: ids,
    access: () => memoryAccessSource(world),
    store: () => store,
  });
});

const live = process.env.READY_LOCAL_SUPABASE === '1';

test('the local supabase adapter passes the store contract', { skip: !live }, async () => {
  await runContract(await supabaseHarness());
});

function requiredEnv(name: string): string {
  const value = process.env[name];
  assert.equal(typeof value, 'string', name);
  assert.notEqual(value?.trim(), '', name);
  assert.equal(value?.includes(hosted), false, name);
  return value ?? '';
}

async function supabaseHarness(): Promise<Harness> {
  const apiUrl = requiredEnv('READY_LOCAL_API_URL').replace(/\/$/u, '');
  const anonKey = requiredEnv('READY_LOCAL_ANON_KEY');
  const serviceKey = requiredEnv('READY_LOCAL_SERVICE_ROLE_KEY');
  const dbUrl = requiredEnv('READY_LOCAL_DB_URL');
  const ids = actors();
  const password = 'harbor-example-password';
  const emails = new Map<string, string>();
  const people = ['parent', 'volunteer', 'leader', 'outsider', 'guest', 'joiner'] as const;
  for (const name of people) {
    const email = `${name}.${uuid()}@example.com`;
    const userId = await createUser(apiUrl, serviceKey, email, password);
    ids[name] = userId;
    emails.set(userId, email);
  }
  seedDatabase(dbUrl, ids);
  const tokens = new Map<string, string>();
  for (const [userId, email] of emails) {
    tokens.set(userId, await signIn(apiUrl, anonKey, email, password));
  }
  return {
    actors: ids,
    access: (userId) => bindToken(apiUrl, anonKey, tokenFor(tokens, userId)),
    store: (userId) =>
      new SupabaseStore({
        supabaseUrl: apiUrl,
        anonKey,
        accessToken: tokenFor(tokens, userId),
        fetch: globalThis.fetch,
      }),
  };
}

function tokenFor(tokens: Map<string, string>, userId: string): string {
  const token = tokens.get(userId);
  if (token === undefined) throw new Error('missing local session');
  return token;
}

function bindToken(apiUrl: string, anonKey: string, token: string): AccessSource {
  const source = supabaseAccessSource({
    supabaseUrl: apiUrl,
    anonKey,
    fetch: globalThis.fetch,
  });
  return {
    async run(input) {
      return source.run({ ...input, accessToken: token });
    },
  };
}

async function createUser(apiUrl: string, serviceKey: string, email: string, password: string): Promise<string> {
  const response = await fetch(`${apiUrl}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const body = (await response.json()) as { id?: unknown };
  if (!response.ok || typeof body.id !== 'string' || !isUuid(body.id)) {
    throw new Error(`local user create failed with ${response.status}`);
  }
  return body.id;
}

async function signIn(apiUrl: string, anonKey: string, email: string, password: string): Promise<string> {
  const response = await fetch(`${apiUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      apikey: anonKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });
  const body = (await response.json()) as { access_token?: unknown };
  if (!response.ok || typeof body.access_token !== 'string' || body.access_token.length === 0) {
    throw new Error(`local sign-in failed with ${response.status}`);
  }
  return body.access_token;
}

function quote(value: string): string {
  if (!isUuid(value)) throw new Error('refusing a non-uuid in local seed');
  return `'${value}'`;
}

function seedDatabase(dbUrl: string, ids: Actors): void {
  const lines = JSON.stringify([{ field: 'loves', text: BRIEF_TEXT }]);
  const sql = `
    insert into public.organizations (id, name) values (${quote(ids.org)}, 'Example Harbor Fellowship');
    insert into public.memberships (organization_id, user_id, role) values
      (${quote(ids.org)}, ${quote(ids.parent)}, 'parent'),
      (${quote(ids.org)}, ${quote(ids.volunteer)}, 'volunteer'),
      (${quote(ids.org)}, ${quote(ids.leader)}, 'leader');
    insert into public.children (id, organization_id, display_name, parent_user_id) values
      (${quote(ids.child)}, ${quote(ids.org)}, '${CHILD_NAME}', ${quote(ids.parent)});
    insert into public.rooms (id, organization_id, name) values
      (${quote(ids.room)}, ${quote(ids.org)}, 'Harbor Room');
    insert into public.sundays (id, organization_id, label) values
      (${quote(ids.sunday)}, ${quote(ids.org)}, 'Sunday 9:30');
    insert into public.volunteer_assignments (organization_id, user_id, room_id, sunday_id) values
      (${quote(ids.org)}, ${quote(ids.volunteer)}, ${quote(ids.room)}, ${quote(ids.sunday)});
    insert into public.shared_briefs (id, organization_id, child_id, room_id, sunday_id, shared, lines) values
      (${quote(ids.brief)}, ${quote(ids.org)}, ${quote(ids.child)}, ${quote(ids.room)}, ${quote(ids.sunday)}, true, '${lines}'::jsonb);
    insert into public.church_setup (organization_id, name, service, room, leader_label, ages, plan) values
      (${quote(ids.org)}, '${CHURCH_NAME}', 'Sunday 9:30', 'Harbor Room', 'Devon Placeholder', 'Ages 5-12', 'A short welcome.');
    insert into public.lessons (id, organization_id, title) values
      (${quote(ids.lesson)}, ${quote(ids.org)}, '${LESSON_TITLE}');
    insert into public.medical_notes (child_id, organization_id, note) values
      (${quote(ids.child)}, ${quote(ids.org)}, '${MEDICAL_NOTE}');
  `;
  const result = spawnSync('psql', [dbUrl, '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}
