import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleRequest, type AppDeps } from '../src/app.ts';
import type { AccessWorld } from '../src/access.ts';
import { supabaseAuthVerifier } from '../src/supabase-auth.ts';
import { churchStore, testEnv } from './fixtures.ts';

const user = {
  parentHarbor: '10000000-0000-4000-8000-000000000101',
  parentOther: '10000000-0000-4000-8000-000000000102',
  volunteerHarbor: '10000000-0000-4000-8000-000000000103',
  volunteerRoom: '10000000-0000-4000-8000-000000000104',
  volunteerSunday: '10000000-0000-4000-8000-000000000105',
  leaderHarbor: '10000000-0000-4000-8000-000000000106',
  leaderInland: '10000000-0000-4000-8000-000000000107',
  userNew: '10000000-0000-4000-8000-000000000108',
  userNewTwo: '10000000-0000-4000-8000-000000000109',
} as const;

const token: Record<(typeof user)[keyof typeof user], string> = {
  [user.parentHarbor]: 'session-parent-harbor',
  [user.parentOther]: 'session-parent-other',
  [user.volunteerHarbor]: 'session-volunteer-harbor',
  [user.volunteerRoom]: 'session-volunteer-room',
  [user.volunteerSunday]: 'session-volunteer-sunday',
  [user.leaderHarbor]: 'session-leader-harbor',
  [user.leaderInland]: 'session-leader-inland',
  [user.userNew]: 'session-user-new',
  [user.userNewTwo]: 'session-user-new-two',
};

function harbor(): AccessWorld {
  return {
    sessions: [{ sessionId: 'local-only-session', userId: user.parentHarbor }],
    memberships: [
      { userId: user.parentHarbor, organizationId: 'org-harbor', role: 'parent' },
      { userId: user.parentOther, organizationId: 'org-harbor', role: 'parent' },
      { userId: user.volunteerHarbor, organizationId: 'org-harbor', role: 'volunteer' },
      { userId: user.volunteerRoom, organizationId: 'org-harbor', role: 'volunteer' },
      { userId: user.volunteerSunday, organizationId: 'org-harbor', role: 'volunteer' },
      { userId: user.leaderHarbor, organizationId: 'org-harbor', role: 'leader' },
      { userId: user.leaderInland, organizationId: 'org-inland', role: 'leader' },
    ],
    children: [
      {
        id: 'child-harbor',
        organizationId: 'org-harbor',
        parentUserId: user.parentHarbor,
        displayName: 'HARBOR-CHILD',
      },
      {
        id: 'child-other',
        organizationId: 'org-harbor',
        parentUserId: user.parentOther,
        displayName: 'OTHER-CHILD',
      },
      {
        id: 'child-inland',
        organizationId: 'org-inland',
        parentUserId: '10000000-0000-4000-8000-000000000110',
        displayName: 'INLAND-CHILD',
      },
    ],
    assignments: [
      {
        userId: user.volunteerHarbor,
        organizationId: 'org-harbor',
        roomId: 'room-harbor',
        sundayId: 'sunday-harbor',
      },
      {
        userId: user.volunteerRoom,
        organizationId: 'org-harbor',
        roomId: 'room-other',
        sundayId: 'sunday-harbor',
      },
      {
        userId: user.volunteerSunday,
        organizationId: 'org-harbor',
        roomId: 'room-harbor',
        sundayId: 'sunday-other',
      },
    ],
    briefs: [
      {
        id: 'brief-harbor',
        organizationId: 'org-harbor',
        childId: 'child-harbor',
        roomId: 'room-harbor',
        sundayId: 'sunday-harbor',
        shared: true,
        lines: [
          { field: 'loves', text: 'HARBOR-LOVES' },
          { field: 'medical', text: 'HARBOR-MEDICAL' },
        ],
      },
      {
        id: 'brief-room',
        organizationId: 'org-harbor',
        childId: 'child-other',
        roomId: 'room-other',
        sundayId: 'sunday-harbor',
        shared: true,
        lines: [{ field: 'loves', text: 'OTHER-ROOM-LOVES' }],
      },
      {
        id: 'brief-sunday',
        organizationId: 'org-harbor',
        childId: 'child-harbor',
        roomId: 'room-harbor',
        sundayId: 'sunday-other',
        shared: true,
        lines: [{ field: 'loves', text: 'OTHER-SUNDAY-LOVES' }],
      },
      {
        id: 'brief-inland',
        organizationId: 'org-inland',
        childId: 'child-inland',
        roomId: 'room-inland',
        sundayId: 'sunday-inland',
        shared: true,
        lines: [{ field: 'loves', text: 'INLAND-LOVES' }],
      },
    ],
    churches: [
      { organizationId: 'org-harbor', name: 'HARBOR-CHURCH' },
      { organizationId: 'org-inland', name: 'INLAND-CHURCH' },
    ],
    lessons: [
      { id: 'lesson-harbor', organizationId: 'org-harbor', title: 'HARBOR-LESSON' },
      { id: 'lesson-inland', organizationId: 'org-inland', title: 'INLAND-LESSON' },
    ],
    medicalGrants: [],
    invites: [],
  };
}

function authFetch(calls: string[]): typeof fetch {
  return async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push(url);
    const headers = new Headers(init?.headers);
    if (url !== `${testEnv.SUPABASE_URL}/auth/v1/user`) return new Response(null, { status: 404 });
    if ((init?.method ?? 'GET') !== 'GET') return new Response(null, { status: 405 });
    if (headers.get('apikey') !== testEnv.SUPABASE_ANON_KEY) return new Response(null, { status: 401 });
    const match = /^Bearer (\S+)$/.exec(headers.get('authorization') ?? '');
    const bearer = match?.[1];
    const userId = bearer === undefined ? undefined : Object.entries(token).find(([, value]) => value === bearer)?.[0];
    if (userId === undefined) return new Response(JSON.stringify({ message: 'bad session' }), { status: 401 });
    return new Response(
      JSON.stringify({
        id: userId,
        role: 'service_role',
        app_metadata: { role: 'leader' },
        contact: 'person-marker',
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };
}

function deps(world: AccessWorld, flag: string | undefined, fetchImpl: typeof fetch): AppDeps {
  return {
    env: flag === undefined ? testEnv : { ...testEnv, READY_SIGN_IN: flag },
    fetch: fetchImpl,
    storeFactory: () => churchStore(),
    log: () => undefined,
    accessWorld: world,
    auth: supabaseAuthVerifier({
      supabaseUrl: testEnv.SUPABASE_URL,
      anonKey: testEnv.SUPABASE_ANON_KEY,
      fetch: fetchImpl,
    }),
  };
}

function send(
  world: AccessWorld,
  fetchImpl: typeof fetch,
  method: string,
  path: string,
  session?: string,
  body?: unknown,
): Promise<Response> {
  const headers = new Headers();
  if (session !== undefined) headers.set('authorization', `Bearer ${session}`);
  if (body !== undefined) headers.set('content-type', 'application/json');
  return handleRequest(
    new Request(new URL(path, 'https://example.com'), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    deps(world, 'on', fetchImpl),
  );
}

async function assertHidden(response: Response, marker: string): Promise<void> {
  const text = await response.text();
  assert.equal(response.status, 404);
  assert.equal(text, '{"error":"not_found"}');
  assert.equal(text.includes(marker), false);
}

test('the adapter asks Auth for the user and ignores role claims', async () => {
  const calls: string[] = [];
  const fetchImpl = authFetch(calls);
  const own = await send(harbor(), fetchImpl, 'GET', '/v1/access/children/child-harbor', token[user.parentHarbor]);
  assert.equal(own.status, 200);
  assert.deepEqual(await own.json(), { id: 'child-harbor', displayName: 'HARBOR-CHILD' });
  assert.deepEqual(calls, [`${testEnv.SUPABASE_URL}/auth/v1/user`]);
  await assertHidden(
    await send(harbor(), fetchImpl, 'GET', '/v1/access/churches/org-harbor', token[user.parentHarbor]),
    'HARBOR-CHURCH',
  );
});

test('a parent reads only their own child through the adapter', async () => {
  const fetchImpl = authFetch([]);
  const world = harbor();
  const own = await send(world, fetchImpl, 'GET', '/v1/access/children/child-harbor', token[user.parentHarbor]);
  assert.equal(own.status, 200);
  assert.deepEqual(await own.json(), { id: 'child-harbor', displayName: 'HARBOR-CHILD' });

  await assertHidden(
    await send(world, fetchImpl, 'GET', '/v1/access/children/child-other', token[user.parentHarbor]),
    'OTHER-CHILD',
  );
  await assertHidden(
    await send(world, fetchImpl, 'GET', '/v1/access/children/child-inland', token[user.parentHarbor]),
    'INLAND-CHILD',
  );
  await assertHidden(
    await send(world, fetchImpl, 'GET', '/v1/access/children/child-harbor', token[user.parentOther]),
    'HARBOR-CHILD',
  );
  await assertHidden(
    await send(world, fetchImpl, 'GET', '/v1/access/children/child-harbor', token[user.leaderHarbor]),
    'HARBOR-CHILD',
  );
  await assertHidden(
    await send(world, fetchImpl, 'GET', '/v1/access/children/child-harbor', token[user.volunteerHarbor]),
    'HARBOR-CHILD',
  );
});

test('a volunteer reads only the brief for their room and Sunday through the adapter', async () => {
  const fetchImpl = authFetch([]);
  const world = harbor();
  const own = await send(world, fetchImpl, 'GET', '/v1/access/briefs/brief-harbor', token[user.volunteerHarbor]);
  assert.equal(own.status, 200);
  assert.deepEqual(await own.json(), {
    id: 'brief-harbor',
    lines: [{ field: 'loves', text: 'HARBOR-LOVES' }],
  });

  await assertHidden(
    await send(world, fetchImpl, 'GET', '/v1/access/briefs/brief-room', token[user.volunteerHarbor]),
    'OTHER-ROOM-LOVES',
  );
  await assertHidden(
    await send(world, fetchImpl, 'GET', '/v1/access/briefs/brief-sunday', token[user.volunteerHarbor]),
    'OTHER-SUNDAY-LOVES',
  );
  await assertHidden(
    await send(world, fetchImpl, 'GET', '/v1/access/briefs/brief-inland', token[user.volunteerHarbor]),
    'INLAND-LOVES',
  );
  await assertHidden(
    await send(world, fetchImpl, 'GET', '/v1/access/briefs/brief-harbor', token[user.volunteerRoom]),
    'HARBOR-LOVES',
  );
  await assertHidden(
    await send(world, fetchImpl, 'GET', '/v1/access/briefs/brief-harbor', token[user.volunteerSunday]),
    'HARBOR-LOVES',
  );
});

test('a leader reads only their church setup and lessons through the adapter', async () => {
  const fetchImpl = authFetch([]);
  const world = harbor();
  const church = await send(world, fetchImpl, 'GET', '/v1/access/churches/org-harbor', token[user.leaderHarbor]);
  assert.equal(church.status, 200);
  assert.deepEqual(await church.json(), { organizationId: 'org-harbor', name: 'HARBOR-CHURCH' });
  const lesson = await send(world, fetchImpl, 'GET', '/v1/access/lessons/lesson-harbor', token[user.leaderHarbor]);
  assert.equal(lesson.status, 200);
  assert.deepEqual(await lesson.json(), { id: 'lesson-harbor', title: 'HARBOR-LESSON' });

  await assertHidden(
    await send(world, fetchImpl, 'GET', '/v1/access/churches/org-inland', token[user.leaderHarbor]),
    'INLAND-CHURCH',
  );
  await assertHidden(
    await send(world, fetchImpl, 'GET', '/v1/access/lessons/lesson-inland', token[user.leaderHarbor]),
    'INLAND-LESSON',
  );
  await assertHidden(
    await send(world, fetchImpl, 'GET', '/v1/access/churches/org-harbor', token[user.leaderInland]),
    'HARBOR-CHURCH',
  );
  await assertHidden(
    await send(world, fetchImpl, 'GET', '/v1/access/churches/org-harbor', token[user.parentHarbor]),
    'HARBOR-CHURCH',
  );
  await assertHidden(
    await send(world, fetchImpl, 'GET', '/v1/access/lessons/lesson-harbor', token[user.volunteerHarbor]),
    'HARBOR-LESSON',
  );
});

test('medical stays off until that child parent grants it through the adapter', async () => {
  const fetchImpl = authFetch([]);
  const world = harbor();
  const before = await send(world, fetchImpl, 'GET', '/v1/access/briefs/brief-harbor', token[user.volunteerHarbor]);
  assert.deepEqual(await before.json(), {
    id: 'brief-harbor',
    lines: [{ field: 'loves', text: 'HARBOR-LOVES' }],
  });

  const volunteerGrant = await send(world, fetchImpl, 'POST', '/v1/access/medical-grants', token[user.volunteerHarbor], {
    childId: 'child-harbor',
  });
  assert.equal(volunteerGrant.status, 403);
  const otherParent = await send(world, fetchImpl, 'POST', '/v1/access/medical-grants', token[user.parentOther], {
    childId: 'child-harbor',
  });
  assert.equal(otherParent.status, 403);
  const stillHidden = await send(world, fetchImpl, 'GET', '/v1/access/briefs/brief-harbor', token[user.volunteerHarbor]);
  const hiddenBody = (await stillHidden.json()) as { lines: { field: string; text: string }[] };
  assert.equal(
    hiddenBody.lines.some((line) => line.field === 'medical' || line.text === 'HARBOR-MEDICAL'),
    false,
  );

  const grant = await send(world, fetchImpl, 'POST', '/v1/access/medical-grants', token[user.parentHarbor], {
    childId: 'child-harbor',
  });
  assert.equal(grant.status, 200);
  assert.deepEqual(await grant.json(), { granted: true });

  const after = await send(world, fetchImpl, 'GET', '/v1/access/briefs/brief-harbor', token[user.volunteerHarbor]);
  assert.deepEqual(await after.json(), {
    id: 'brief-harbor',
    lines: [
      { field: 'loves', text: 'HARBOR-LOVES' },
      { field: 'medical', text: 'HARBOR-MEDICAL' },
    ],
  });
});

test('self-register and invite cannot escalate a role through the adapter', async () => {
  const fetchImpl = authFetch([]);
  const world = harbor();
  for (const role of ['volunteer', 'leader', 'admin']) {
    const denied = await send(world, fetchImpl, 'POST', '/v1/access/register', token[user.userNew], {
      organizationId: 'org-harbor',
      role,
    });
    assert.equal(denied.status, 403);
    assert.deepEqual(await denied.json(), { error: 'forbidden' });
  }
  assert.equal((await send(world, fetchImpl, 'GET', '/v1/access/membership', token[user.userNew])).status, 404);

  const registered = await send(world, fetchImpl, 'POST', '/v1/access/register', token[user.userNew], {
    organizationId: 'org-harbor',
    role: 'parent',
  });
  assert.equal(registered.status, 201);
  assert.deepEqual(await registered.json(), { role: 'parent' });
  const later = await send(world, fetchImpl, 'POST', '/v1/access/register', token[user.userNew], {
    organizationId: 'org-harbor',
    role: 'leader',
  });
  assert.equal(later.status, 403);
  const membership = await send(world, fetchImpl, 'GET', '/v1/access/membership', token[user.userNew]);
  assert.deepEqual(await membership.json(), { role: 'parent' });

  const parentInvite = await send(world, fetchImpl, 'POST', '/v1/access/invites', token[user.parentHarbor], {
    organizationId: 'org-harbor',
    role: 'leader',
  });
  assert.equal(parentInvite.status, 403);
  const otherChurch = await send(world, fetchImpl, 'POST', '/v1/access/invites', token[user.leaderHarbor], {
    organizationId: 'org-inland',
    role: 'leader',
  });
  assert.equal(otherChurch.status, 403);
  const adminInvite = await send(world, fetchImpl, 'POST', '/v1/access/invites', token[user.leaderHarbor], {
    organizationId: 'org-harbor',
    role: 'admin',
  });
  assert.equal(adminInvite.status, 403);

  const invite = await send(world, fetchImpl, 'POST', '/v1/access/invites', token[user.leaderHarbor], {
    organizationId: 'org-harbor',
    role: 'volunteer',
  });
  assert.equal(invite.status, 201);
  const created = (await invite.json()) as { id: string; role: string };
  assert.equal(created.role, 'volunteer');
  const escalated = await send(
    world,
    fetchImpl,
    'POST',
    `/v1/access/invites/${created.id}/accept`,
    token[user.userNewTwo],
    { role: 'leader' },
  );
  assert.equal(escalated.status, 403);
  assert.equal((await send(world, fetchImpl, 'GET', '/v1/access/membership', token[user.userNewTwo])).status, 404);

  const accepted = await send(world, fetchImpl, 'POST', `/v1/access/invites/${created.id}/accept`, token[user.userNewTwo], {});
  assert.equal(accepted.status, 201);
  assert.deepEqual(await accepted.json(), { role: 'volunteer' });
  await assertHidden(
    await send(world, fetchImpl, 'GET', '/v1/access/churches/org-harbor', token[user.userNewTwo]),
    'HARBOR-CHURCH',
  );
});

test('a rejected Auth session stays unauthorized and does not fall back to the local directory', async () => {
  const fetchImpl = authFetch([]);
  const world = harbor();
  const missing = await send(world, fetchImpl, 'GET', '/v1/access/children/child-harbor');
  assert.equal(missing.status, 401);
  const unknown = await send(world, fetchImpl, 'GET', '/v1/access/children/child-harbor', 'session-unknown');
  assert.equal(unknown.status, 401);
  assert.equal((await unknown.text()).includes('HARBOR-CHILD'), false);
  const directory = await send(world, fetchImpl, 'GET', '/v1/access/children/child-harbor', 'local-only-session');
  assert.equal(directory.status, 401);
  const asUserId = await send(world, fetchImpl, 'GET', '/v1/access/children/child-harbor', user.parentHarbor);
  assert.equal(asUserId.status, 401);
});

test('the adapter rejects a non-user id, a redirect, and a blank project', async () => {
  const world = harbor();
  const badId: typeof fetch = async () =>
    new Response(JSON.stringify({ id: 'not-a-user', role: 'leader' }), { status: 200 });
  const bad = await send(world, badId, 'GET', '/v1/access/children/child-harbor', token[user.parentHarbor]);
  assert.equal(bad.status, 401);

  let redirects = 0;
  const redirect: typeof fetch = async () => {
    redirects += 1;
    return new Response(null, { status: 302, headers: { location: 'https://example.com/elsewhere' } });
  };
  const moved = await send(world, redirect, 'GET', '/v1/access/membership', token[user.parentHarbor]);
  assert.equal(moved.status, 401);
  assert.equal(redirects, 1);

  let blanks = 0;
  const blankFetch: typeof fetch = async () => {
    blanks += 1;
    return new Response(null, { status: 200 });
  };
  const closed = await handleRequest(
    new Request('https://example.com/v1/access/membership', {
      headers: { authorization: `Bearer ${token[user.parentHarbor]}` },
    }),
    {
      ...deps(world, 'on', blankFetch),
      auth: supabaseAuthVerifier({ supabaseUrl: '  ', anonKey: '  ', fetch: blankFetch }),
    },
  );
  assert.equal(closed.status, 401);
  assert.equal(blanks, 0);
});

test('the flag off path does not call Auth', async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ id: user.parentHarbor }), { status: 200 });
  };
  const response = await handleRequest(
    new Request('https://example.com/v1/access/children/child-harbor', {
      headers: { authorization: `Bearer ${token[user.parentHarbor]}` },
    }),
    deps(harbor(), undefined, fetchImpl),
  );
  const text = await response.text();
  assert.equal(response.status, 404);
  assert.equal(text, '{"error":"not_found"}');
  assert.equal(text.includes('HARBOR-CHILD'), false);
  assert.equal(calls, 0);
});

test('adapter failures do not log the session, the user id, or the Auth body', async () => {
  const lines: string[] = [];
  const log = console.log;
  const error = console.error;
  console.log = (...args: unknown[]) => {
    lines.push(args.map((item) => String(item)).join(' '));
  };
  console.error = (...args: unknown[]) => {
    lines.push(args.map((item) => String(item)).join(' '));
  };
  try {
    const fetchImpl = authFetch([]);
    await send(harbor(), fetchImpl, 'GET', '/v1/access/children/child-harbor', token[user.parentHarbor]);
    await send(harbor(), fetchImpl, 'GET', '/v1/access/children/child-other', token[user.parentHarbor]);
    await send(harbor(), authFetch([]), 'GET', '/v1/access/children/child-harbor', 'session-unknown');
  } finally {
    console.log = log;
    console.error = error;
  }
  const blob = lines.join('\n');
  assert.equal(blob.includes('HARBOR-CHILD'), false);
  assert.equal(blob.includes('person-marker'), false);
  assert.equal(blob.includes('session-parent-harbor'), false);
  assert.equal(blob.includes(user.parentHarbor), false);
  assert.equal(blob.includes('service_role'), false);
  assert.equal(blob.includes('@'), false);
});
