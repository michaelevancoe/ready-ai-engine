import assert from 'node:assert/strict';
import { test } from 'node:test';
import { persistDispatch, type AccountScope } from '../web/lib/persist-visit.ts';
import { initialVisit, reduceVisit } from '../web/lib/visit.ts';
import { withE2eLock } from '../web/server/e2e-epoch.ts';
import { syncVisit } from '../web/server/visit-sync.ts';
import { parseSyncBody, userIdFromAuthorization, visitWrites } from '../web/server/visit-writes.ts';

const scope: AccountScope = {
  organizationId: '10000000-0000-4000-8000-000000000001',
  childId: '10000000-0000-4000-8000-000000000021',
};
const userId = '10000000-0000-4000-8000-000000000014';

function bearer(sub: string): string {
  const payload = Buffer.from(JSON.stringify({ sub })).toString('base64url');
  return `Bearer header.${payload}.sig`;
}

test('the same plan writes the same row twice and maps the leader label', () => {
  const start = initialVisit();
  const next = reduceVisit(start, {
    type: 'saveChurch',
    church: { ...start.church, name: 'Harbor', leader: 'Ms. Dana' },
  });
  const plan = persistDispatch(start, next, scope);
  const first = visitWrites(userId, scope, plan);
  const second = visitWrites(userId, scope, plan);
  assert.deepEqual(first, second);
  assert.equal(first.length, 1);
  const write = first[0];
  assert.equal(write?.method, 'POST');
  if (write?.method !== 'POST') return;
  assert.equal(write.table, 'church_setup');
  assert.equal(write.conflict, 'organization_id');
  assert.equal(write.row.leader_label, 'Ms. Dana');
  assert.equal(write.row.organization_id, scope.organizationId);
});

test('an older plan that still carries a lesson saves the church and skips the lesson', () => {
  const church = {
    organizationId: scope.organizationId,
    church: {
      name: 'Fictional Harbor',
      service: 'Sunday 9:00',
      room: 'Harbor Room',
      leader: 'Ms. Dana',
      ages: 'Ages 5-12',
      plan: 'A short welcome.',
    },
  };
  const withLesson = {
    scope,
    plan: {
      answers: null,
      brief: null,
      publication: null,
      notes: null,
      church,
      lesson: {
        action: 'upsert',
        organizationId: scope.organizationId,
        source: 'Old fictional lesson',
        summary: 'Old summary',
        steps: ['Sit down'],
      },
      update: null,
    },
  };
  const parsed = parseSyncBody(withLesson);
  assert.notEqual(parsed, null);
  if (parsed === null) return;
  const writes = visitWrites(userId, scope, parsed.plan);
  assert.equal(
    writes.some((write) => write.table === 'lessons'),
    false,
  );
  assert.equal(
    writes.some((write) => write.table === 'church_setup'),
    true,
  );

  const withoutLesson = parseSyncBody({
    scope,
    plan: {
      answers: null,
      brief: null,
      publication: null,
      notes: null,
      church,
      update: null,
    },
  });
  assert.notEqual(withoutLesson, null);
});

test('a sync body cannot publish a medical line', () => {
  const body = {
    scope,
    plan: {
      answers: null,
      brief: null,
      publication: {
        action: 'upsert',
        organizationId: scope.organizationId,
        childId: scope.childId,
        lines: [{ field: 'medical', label: 'Medical', text: 'Secret' }],
      },
      notes: null,
      church: null,
      update: null,
    },
  };
  assert.equal(parseSyncBody(body), null);
  assert.equal(userIdFromAuthorization(bearer(userId)), userId);
  assert.equal(userIdFromAuthorization('Bearer not-a-jwt'), null);
});

test('visit sync is absent without a loopback key and forwards the user bearer', async () => {
  const names = ['READY_VISIT_STORE', 'READY_LOCAL_API_URL', 'READY_LOCAL_ANON_KEY', 'READY_ACCOUNT_E2E'] as const;
  const previous = new Map(names.map((name) => [name, process.env[name]]));
  const calls: { url: string; apikey: string | null; authorization: string | null; prefer: string | null }[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    calls.push({
      url: typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url,
      apikey: headers.get('apikey'),
      authorization: headers.get('authorization'),
      prefer: headers.get('prefer'),
    });
    return new Response(null, { status: 201 });
  };
  try {
    delete process.env.READY_LOCAL_API_URL;
    delete process.env.READY_LOCAL_ANON_KEY;
    const missing = await syncVisit(new Request('http://127.0.0.1/visit-sync', { method: 'POST', body: '{}' }));
    assert.equal(missing.status, 404);
    assert.equal(calls.length, 0);

    process.env.READY_LOCAL_API_URL = 'http://127.0.0.1:54321';
    process.env.READY_LOCAL_ANON_KEY = 'local-anon';
    const start = initialVisit();
    const next = reduceVisit(start, { type: 'saveNotes', notes: 'A quiet corner.' });
    const plan = persistDispatch(start, next, scope);
    const saved = await syncVisit(
      new Request('http://127.0.0.1/visit-sync', {
        method: 'POST',
        headers: { authorization: bearer('10000000-0000-4000-8000-000000000013'), 'content-type': 'application/json' },
        body: JSON.stringify({ scope, plan }),
      }),
    );
    assert.equal(saved.status, 204);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.apikey, 'local-anon');
    assert.equal(calls[0]?.authorization, bearer('10000000-0000-4000-8000-000000000013'));
    assert.equal(calls[0]?.prefer, 'resolution=merge-duplicates,return=minimal');
    assert.equal(calls[0]?.url.includes('/rest/v1/volunteer_notes?on_conflict=user_id%2Cchild_id'), true);
    assert.equal(calls[0]?.url.includes('127.0.0.1:54321'), true);
    process.env.READY_LOCAL_API_URL = 'https://example.com';
    const refused = await syncVisit(
      new Request('http://127.0.0.1/visit-sync', {
        method: 'POST',
        headers: { authorization: bearer(userId), 'content-type': 'application/json' },
        body: JSON.stringify({ scope, plan }),
      }),
    );
    assert.equal(refused.status, 404);
    assert.equal(calls.length, 1);

    process.env.READY_LOCAL_API_URL = 'http://127.0.0.1:54321';
    process.env.READY_ACCOUNT_E2E = '1';
    const current = await withE2eLock(async (epoch) => epoch);
    const missingEpoch = await syncVisit(
      new Request('http://127.0.0.1/visit-sync', {
        method: 'POST',
        headers: { authorization: bearer(userId), 'content-type': 'application/json' },
        body: JSON.stringify({ scope, plan }),
      }),
    );
    assert.equal(missingEpoch.status, 400);
    assert.equal(calls.length, 1);
    const stale = await syncVisit(
      new Request('http://127.0.0.1/visit-sync', {
        method: 'POST',
        headers: { authorization: bearer(userId), 'content-type': 'application/json' },
        body: JSON.stringify({ scope, plan, epoch: current + 1 }),
      }),
    );
    assert.equal(stale.status, 409);
    assert.equal(calls.length, 1);
    const fresh = await syncVisit(
      new Request('http://127.0.0.1/visit-sync', {
        method: 'POST',
        headers: { authorization: bearer(userId), 'content-type': 'application/json' },
        body: JSON.stringify({ scope, plan, epoch: current }),
      }),
    );
    assert.equal(fresh.status, 204);
    assert.equal(calls.length, 2);
  } finally {
    globalThis.fetch = original;
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
