import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleRequest, type AppDeps } from '../src/app.ts';
import type { AccessWorld } from '../src/access.ts';
import { churchStore, testEnv } from './fixtures.ts';

function harbor(): AccessWorld {
  return {
    sessions: [
      { sessionId: 'user-parent-harbor', userId: 'user-parent-harbor' },
      { sessionId: 'user-parent-other', userId: 'user-parent-other' },
      { sessionId: 'user-volunteer-harbor', userId: 'user-volunteer-harbor' },
      { sessionId: 'user-volunteer-room', userId: 'user-volunteer-room' },
      { sessionId: 'user-volunteer-sunday', userId: 'user-volunteer-sunday' },
      { sessionId: 'user-leader-harbor', userId: 'user-leader-harbor' },
      { sessionId: 'user-leader-inland', userId: 'user-leader-inland' },
      { sessionId: 'user-new', userId: 'user-new' },
      { sessionId: 'user-new-two', userId: 'user-new-two' },
    ],
    memberships: [
      { userId: 'user-parent-harbor', organizationId: 'org-harbor', role: 'parent' },
      { userId: 'user-parent-other', organizationId: 'org-harbor', role: 'parent' },
      { userId: 'user-volunteer-harbor', organizationId: 'org-harbor', role: 'volunteer' },
      { userId: 'user-volunteer-room', organizationId: 'org-harbor', role: 'volunteer' },
      { userId: 'user-volunteer-sunday', organizationId: 'org-harbor', role: 'volunteer' },
      { userId: 'user-leader-harbor', organizationId: 'org-harbor', role: 'leader' },
      { userId: 'user-leader-inland', organizationId: 'org-inland', role: 'leader' },
    ],
    children: [
      {
        id: 'child-harbor',
        organizationId: 'org-harbor',
        parentUserId: 'user-parent-harbor',
        displayName: 'HARBOR-CHILD',
      },
      {
        id: 'child-other',
        organizationId: 'org-harbor',
        parentUserId: 'user-parent-other',
        displayName: 'OTHER-CHILD',
      },
      {
        id: 'child-inland',
        organizationId: 'org-inland',
        parentUserId: 'user-parent-inland',
        displayName: 'INLAND-CHILD',
      },
    ],
    assignments: [
      {
        userId: 'user-volunteer-harbor',
        organizationId: 'org-harbor',
        roomId: 'room-harbor',
        sundayId: 'sunday-harbor',
      },
      {
        userId: 'user-volunteer-room',
        organizationId: 'org-harbor',
        roomId: 'room-other',
        sundayId: 'sunday-harbor',
      },
      {
        userId: 'user-volunteer-sunday',
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

function deps(world: AccessWorld, flag: string | undefined): AppDeps {
  return {
    env: flag === undefined ? testEnv : { ...testEnv, READY_SIGN_IN: flag },
    fetch: async () => new Response(null, { status: 500 }),
    storeFactory: () => churchStore(),
    log: () => undefined,
    accessWorld: world,
  };
}

function send(
  world: AccessWorld,
  flag: string | undefined,
  method: string,
  path: string,
  user?: string,
  body?: unknown,
): Promise<Response> {
  const headers = new Headers();
  if (user !== undefined) headers.set('authorization', `Bearer ${user}`);
  if (body !== undefined) headers.set('content-type', 'application/json');
  return handleRequest(
    new Request(new URL(path, 'https://example.com'), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    deps(world, flag),
  );
}

async function assertHidden(response: Response, marker: string): Promise<void> {
  const text = await response.text();
  assert.equal(response.status, 404);
  assert.equal(text, '{"error":"not_found"}');
  assert.equal(text.includes(marker), false);
}

test('a parent reads only their own child', async () => {
  const world = harbor();
  const own = await send(world, 'on', 'GET', '/v1/access/children/child-harbor', 'user-parent-harbor');
  assert.equal(own.status, 200);
  assert.deepEqual(await own.json(), { id: 'child-harbor', displayName: 'HARBOR-CHILD' });

  await assertHidden(
    await send(world, 'on', 'GET', '/v1/access/children/child-other', 'user-parent-harbor'),
    'OTHER-CHILD',
  );
  await assertHidden(
    await send(world, 'on', 'GET', '/v1/access/children/child-inland', 'user-parent-harbor'),
    'INLAND-CHILD',
  );
  await assertHidden(
    await send(world, 'on', 'GET', '/v1/access/children/child-harbor', 'user-parent-other'),
    'HARBOR-CHILD',
  );
  await assertHidden(
    await send(world, 'on', 'GET', '/v1/access/children/child-harbor', 'user-leader-harbor'),
    'HARBOR-CHILD',
  );
  await assertHidden(
    await send(world, 'on', 'GET', '/v1/access/children/child-harbor', 'user-volunteer-harbor'),
    'HARBOR-CHILD',
  );
});

test('a volunteer reads only the brief for their room and Sunday', async () => {
  const world = harbor();
  const own = await send(world, 'on', 'GET', '/v1/access/briefs/brief-harbor', 'user-volunteer-harbor');
  assert.equal(own.status, 200);
  assert.deepEqual(await own.json(), {
    id: 'brief-harbor',
    lines: [{ field: 'loves', text: 'HARBOR-LOVES' }],
  });

  await assertHidden(
    await send(world, 'on', 'GET', '/v1/access/briefs/brief-room', 'user-volunteer-harbor'),
    'OTHER-ROOM-LOVES',
  );
  await assertHidden(
    await send(world, 'on', 'GET', '/v1/access/briefs/brief-sunday', 'user-volunteer-harbor'),
    'OTHER-SUNDAY-LOVES',
  );
  await assertHidden(
    await send(world, 'on', 'GET', '/v1/access/briefs/brief-inland', 'user-volunteer-harbor'),
    'INLAND-LOVES',
  );
  await assertHidden(
    await send(world, 'on', 'GET', '/v1/access/briefs/brief-harbor', 'user-volunteer-room'),
    'HARBOR-LOVES',
  );
  await assertHidden(
    await send(world, 'on', 'GET', '/v1/access/briefs/brief-harbor', 'user-volunteer-sunday'),
    'HARBOR-LOVES',
  );
});

test('a leader reads only their church setup and lessons', async () => {
  const world = harbor();
  const church = await send(world, 'on', 'GET', '/v1/access/churches/org-harbor', 'user-leader-harbor');
  assert.equal(church.status, 200);
  assert.deepEqual(await church.json(), { organizationId: 'org-harbor', name: 'HARBOR-CHURCH' });
  const lesson = await send(world, 'on', 'GET', '/v1/access/lessons/lesson-harbor', 'user-leader-harbor');
  assert.equal(lesson.status, 200);
  assert.deepEqual(await lesson.json(), { id: 'lesson-harbor', title: 'HARBOR-LESSON' });

  await assertHidden(
    await send(world, 'on', 'GET', '/v1/access/churches/org-inland', 'user-leader-harbor'),
    'INLAND-CHURCH',
  );
  await assertHidden(
    await send(world, 'on', 'GET', '/v1/access/lessons/lesson-inland', 'user-leader-harbor'),
    'INLAND-LESSON',
  );
  await assertHidden(
    await send(world, 'on', 'GET', '/v1/access/churches/org-harbor', 'user-parent-harbor'),
    'HARBOR-CHURCH',
  );
  await assertHidden(
    await send(world, 'on', 'GET', '/v1/access/lessons/lesson-harbor', 'user-volunteer-harbor'),
    'HARBOR-LESSON',
  );
});

test('medical stays off until that child parent grants it', async () => {
  const world = harbor();
  const before = await send(world, 'on', 'GET', '/v1/access/briefs/brief-harbor', 'user-volunteer-harbor');
  assert.deepEqual(await before.json(), {
    id: 'brief-harbor',
    lines: [{ field: 'loves', text: 'HARBOR-LOVES' }],
  });

  const volunteerGrant = await send(world, 'on', 'POST', '/v1/access/medical-grants', 'user-volunteer-harbor', {
    childId: 'child-harbor',
  });
  assert.equal(volunteerGrant.status, 403);
  const otherParent = await send(world, 'on', 'POST', '/v1/access/medical-grants', 'user-parent-other', {
    childId: 'child-harbor',
  });
  assert.equal(otherParent.status, 403);
  const stillHidden = await send(world, 'on', 'GET', '/v1/access/briefs/brief-harbor', 'user-volunteer-harbor');
  const hiddenBody = (await stillHidden.json()) as { lines: { field: string; text: string }[] };
  assert.equal(
    hiddenBody.lines.some((line) => line.field === 'medical' || line.text === 'HARBOR-MEDICAL'),
    false,
  );

  const grant = await send(world, 'on', 'POST', '/v1/access/medical-grants', 'user-parent-harbor', {
    childId: 'child-harbor',
  });
  assert.equal(grant.status, 200);
  assert.deepEqual(await grant.json(), { granted: true });
  const again = await send(world, 'on', 'POST', '/v1/access/medical-grants', 'user-parent-harbor', {
    childId: 'child-harbor',
  });
  assert.equal(again.status, 200);

  const after = await send(world, 'on', 'GET', '/v1/access/briefs/brief-harbor', 'user-volunteer-harbor');
  assert.deepEqual(await after.json(), {
    id: 'brief-harbor',
    lines: [
      { field: 'loves', text: 'HARBOR-LOVES' },
      { field: 'medical', text: 'HARBOR-MEDICAL' },
    ],
  });
});

test('self-register and invite cannot escalate a role', async () => {
  const world = harbor();
  for (const role of ['volunteer', 'leader', 'admin']) {
    const denied = await send(world, 'on', 'POST', '/v1/access/register', 'user-new', {
      organizationId: 'org-harbor',
      role,
    });
    assert.equal(denied.status, 403);
    assert.deepEqual(await denied.json(), { error: 'forbidden' });
  }
  assert.equal((await send(world, 'on', 'GET', '/v1/access/membership', 'user-new')).status, 404);

  const registered = await send(world, 'on', 'POST', '/v1/access/register', 'user-new', {
    organizationId: 'org-harbor',
    role: 'parent',
  });
  assert.equal(registered.status, 201);
  assert.deepEqual(await registered.json(), { role: 'parent' });
  const repeat = await send(world, 'on', 'POST', '/v1/access/register', 'user-new', {
    organizationId: 'org-harbor',
    role: 'parent',
  });
  assert.equal(repeat.status, 200);
  assert.deepEqual(await repeat.json(), { role: 'parent' });
  const later = await send(world, 'on', 'POST', '/v1/access/register', 'user-new', {
    organizationId: 'org-harbor',
    role: 'leader',
  });
  assert.equal(later.status, 403);
  const membership = await send(world, 'on', 'GET', '/v1/access/membership', 'user-new');
  assert.deepEqual(await membership.json(), { role: 'parent' });

  const parentInvite = await send(world, 'on', 'POST', '/v1/access/invites', 'user-parent-harbor', {
    organizationId: 'org-harbor',
    role: 'leader',
  });
  assert.equal(parentInvite.status, 403);
  const volunteerInvite = await send(world, 'on', 'POST', '/v1/access/invites', 'user-volunteer-harbor', {
    organizationId: 'org-harbor',
    role: 'leader',
  });
  assert.equal(volunteerInvite.status, 403);
  const adminInvite = await send(world, 'on', 'POST', '/v1/access/invites', 'user-leader-harbor', {
    organizationId: 'org-harbor',
    role: 'admin',
  });
  assert.equal(adminInvite.status, 403);
  const otherChurch = await send(world, 'on', 'POST', '/v1/access/invites', 'user-leader-harbor', {
    organizationId: 'org-inland',
    role: 'leader',
  });
  assert.equal(otherChurch.status, 403);
  assert.equal((await send(world, 'on', 'POST', '/v1/access/invites/invite-1/accept', 'user-new-two', {})).status, 404);

  const invite = await send(world, 'on', 'POST', '/v1/access/invites', 'user-leader-harbor', {
    organizationId: 'org-harbor',
    role: 'volunteer',
  });
  assert.equal(invite.status, 201);
  const created = (await invite.json()) as { id: string; role: string };
  assert.equal(created.role, 'volunteer');
  const escalated = await send(world, 'on', 'POST', `/v1/access/invites/${created.id}/accept`, 'user-new-two', {
    role: 'leader',
  });
  assert.equal(escalated.status, 403);
  assert.equal((await send(world, 'on', 'GET', '/v1/access/membership', 'user-new-two')).status, 404);

  const accepted = await send(world, 'on', 'POST', `/v1/access/invites/${created.id}/accept`, 'user-new-two', {});
  assert.equal(accepted.status, 201);
  assert.deepEqual(await accepted.json(), { role: 'volunteer' });
  const acceptedAgain = await send(world, 'on', 'POST', `/v1/access/invites/${created.id}/accept`, 'user-new-two', {});
  assert.equal(acceptedAgain.status, 200);
  assert.deepEqual(await acceptedAgain.json(), { role: 'volunteer' });
  await assertHidden(
    await send(world, 'on', 'GET', '/v1/access/churches/org-harbor', 'user-new-two'),
    'HARBOR-CHURCH',
  );
});

test('access responses do not log child markers or session ids', async () => {
  const world = harbor();
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
    await send(world, 'on', 'GET', '/v1/access/children/child-harbor', 'user-parent-harbor');
    await send(world, 'on', 'GET', '/v1/access/children/child-other', 'user-parent-harbor');
    await send(world, 'on', 'GET', '/v1/access/briefs/brief-harbor', 'user-volunteer-harbor');
    await send(world, 'on', 'POST', '/v1/access/register', 'user-new', {
      organizationId: 'org-harbor',
      role: 'leader',
    });
  } finally {
    console.log = log;
    console.error = error;
  }
  const blob = lines.join('\n');
  assert.equal(blob.includes('HARBOR-CHILD'), false);
  assert.equal(blob.includes('OTHER-CHILD'), false);
  assert.equal(blob.includes('HARBOR-MEDICAL'), false);
  assert.equal(blob.includes('user-parent-harbor'), false);
  assert.equal(blob.includes('@'), false);
});
