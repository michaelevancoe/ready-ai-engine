import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initialVisit } from '../web/lib/visit.ts';
import { readStoreBoot } from '../web/server/account-boot.ts';

const parentId = '10000000-0000-4000-8000-000000000011';
const leaderId = '10000000-0000-4000-8000-000000000014';
const orgId = '10000000-0000-4000-8000-000000000001';
const childId = '10000000-0000-4000-8000-000000000021';

const names = [
  'READY_VISIT_STORE',
  'READY_LOCAL_API_URL',
  'READY_LOCAL_ANON_KEY',
  'READY_ACCOUNT_SESSIONS',
  'READY_ORGANIZATION_ID',
] as const;

function restore(previous: Map<string, string | undefined>): void {
  for (const [name, value] of previous) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

test('an unset visit store stays on the demo boot', async () => {
  const previous = new Map(names.map((name) => [name, process.env[name]]));
  try {
    delete process.env.READY_VISIT_STORE;
    process.env.READY_LOCAL_API_URL = 'https://example.com';
    assert.deepEqual(await readStoreBoot(), { mode: 'demo' });
  } finally {
    restore(previous);
  }
});

test('a bad account boot throws and does not become a demo', async () => {
  const previous = new Map(names.map((name) => [name, process.env[name]]));
  let calls = 0;
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response('[]', { status: 200 });
  };
  try {
    process.env.READY_VISIT_STORE = 'account';
    process.env.READY_LOCAL_API_URL = 'https://example.com';
    process.env.READY_LOCAL_ANON_KEY = 'local-anon';
    process.env.READY_ACCOUNT_SESSIONS = JSON.stringify([
      { userId: parentId, accessToken: 'parent-token', role: 'parent' },
    ]);
    await assert.rejects(() => readStoreBoot());
    delete process.env.READY_LOCAL_ANON_KEY;
    process.env.READY_LOCAL_API_URL = 'http://127.0.0.1:54321';
    await assert.rejects(() => readStoreBoot());
    process.env.READY_LOCAL_ANON_KEY = 'local-anon';
    process.env.READY_ACCOUNT_SESSIONS = JSON.stringify([
      { userId: parentId, accessToken: '', role: 'parent' },
    ]);
    await assert.rejects(() => readStoreBoot());
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = original;
    restore(previous);
  }
});

test('account boot chooses the one church and restores the leader row', async () => {
  const previous = new Map(names.map((name) => [name, process.env[name]]));
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('apikey'), 'local-anon');
    assert.equal(headers.get('authorization')?.startsWith('Bearer '), true);
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const path = new URL(url).pathname;
    if (path.endsWith('/memberships')) {
      return Response.json([{ organization_id: orgId, role: 'parent' }]);
    }
    if (path.endsWith('/children')) return Response.json([{ id: childId }]);
    if (path.endsWith('/church_setup')) {
      return Response.json([
        {
          name: 'Harbor',
          service: 'Sunday 9:00',
          room: 'Harbor Room',
          leader_label: 'Ms. Dana',
          ages: 'Ages 5-12',
          plan: 'A short welcome.',
        },
      ]);
    }
    return Response.json([]);
  };
  try {
    process.env.READY_VISIT_STORE = 'account';
    process.env.READY_LOCAL_API_URL = 'http://127.0.0.1:54321/';
    process.env.READY_LOCAL_ANON_KEY = 'local-anon';
    delete process.env.READY_ORGANIZATION_ID;
    process.env.READY_ACCOUNT_SESSIONS = JSON.stringify([
      { userId: parentId, accessToken: 'parent-token', role: 'parent' },
      { userId: leaderId, accessToken: 'leader-token', role: 'leader' },
    ]);
    const boot = await readStoreBoot();
    assert.equal(boot.mode, 'account');
    if (boot.mode !== 'account') return;
    assert.equal(boot.scope.organizationId, orgId);
    assert.equal(boot.scope.childId, childId);
    assert.equal(boot.initial.church.name, 'Harbor');
    assert.equal(boot.initial.church.leader, 'Ms. Dana');
    assert.equal(boot.initial.notes, initialVisit().notes);
    assert.equal(boot.sessions.length, 2);
  } finally {
    globalThis.fetch = original;
    restore(previous);
  }
});

test('an older approved lesson row does not block boot and is not copied onto the visit', async () => {
  const previous = new Map(names.map((name) => [name, process.env[name]]));
  const original = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const path = new URL(url).pathname;
    if (path.endsWith('/memberships')) return Response.json([{ organization_id: orgId, role: 'parent' }]);
    if (path.endsWith('/children')) return Response.json([{ id: childId }]);
    if (path.endsWith('/church_setup')) {
      return Response.json([
        {
          name: 'Harbor',
          service: 'Sunday 9:00',
          room: 'Harbor Room',
          leader_label: 'Ms. Dana',
          ages: 'Ages 5-12',
          plan: 'A short welcome.',
        },
      ]);
    }
    if (path.endsWith('/lessons')) return Response.json([{ status: 'approved', source: 12 }]);
    return Response.json([]);
  };
  try {
    process.env.READY_VISIT_STORE = 'account';
    process.env.READY_LOCAL_API_URL = 'http://127.0.0.1:54321/';
    process.env.READY_LOCAL_ANON_KEY = 'local-anon';
    delete process.env.READY_ORGANIZATION_ID;
    process.env.READY_ACCOUNT_SESSIONS = JSON.stringify([
      { userId: parentId, accessToken: 'parent-token', role: 'parent' },
      { userId: leaderId, accessToken: 'leader-token', role: 'leader' },
    ]);
    const boot = await readStoreBoot();
    assert.equal(boot.mode, 'account');
    if (boot.mode !== 'account') return;
    assert.equal(boot.initial.church.name, 'Harbor');
    assert.equal(Object.hasOwn(boot.initial, 'lesson'), false);
    assert.equal(Object.hasOwn(boot.initial, 'lessonSource'), false);
  } finally {
    globalThis.fetch = original;
    restore(previous);
  }
});

test('saved answers reopen on the next question', async () => {
  const previous = new Map(names.map((name) => [name, process.env[name]]));
  const original = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const path = new URL(url).pathname;
    if (path.endsWith('/memberships')) return Response.json([{ organization_id: orgId, role: 'parent' }]);
    if (path.endsWith('/children')) return Response.json([{ id: childId }]);
    if (path.endsWith('/intake_answers')) {
      return Response.json([
        {
          answers: {
            name: { kind: 'answered', text: 'Rowan' },
            age: { kind: 'answered', text: '7' },
            about: { kind: 'answered', text: 'He is quiet.' },
            loves: { kind: 'answered', text: 'Quiet trains' },
          },
        },
      ]);
    }
    return Response.json([]);
  };
  try {
    process.env.READY_VISIT_STORE = 'account';
    process.env.READY_LOCAL_API_URL = 'http://127.0.0.1:54321';
    process.env.READY_LOCAL_ANON_KEY = 'local-anon';
    delete process.env.READY_ORGANIZATION_ID;
    process.env.READY_ACCOUNT_SESSIONS = JSON.stringify([
      { userId: parentId, accessToken: 'parent-token', role: 'parent' },
    ]);
    const boot = await readStoreBoot();
    assert.equal(boot.mode, 'account');
    if (boot.mode !== 'account') return;
    assert.deepEqual(boot.initial.conversation.talk, { mode: 'ask', nodeId: 'overwhelms' });
    assert.equal(boot.initial.conversation.answers.loves?.text, 'Quiet trains');
  } finally {
    globalThis.fetch = original;
    restore(previous);
  }
});
