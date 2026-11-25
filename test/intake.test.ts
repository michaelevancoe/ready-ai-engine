import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleRequest, type AppDeps } from '../src/app.ts';
import type { SafeLog } from '../src/log.ts';
import { sessionAuthVerifier } from '../src/session-auth.ts';
import { bearer, chatEnvelope, churchStore, ids, intakeBody, nowMs, sampleProfile, testEnv, type MemoryStore } from './fixtures.ts';

function deps(store: MemoryStore, fetchImpl: typeof fetch = async () => chatEnvelope(sampleProfile())): AppDeps {
  return {
    env: testEnv,
    fetch: fetchImpl,
    storeFactory: (token) => {
      store.tokens.push(token);
      return store;
    },
    log: () => undefined,
    now: () => nowMs,
    auth: sessionAuthVerifier(),
  };
}

async function post(
  store: MemoryStore,
  path: string,
  body: unknown,
  userId?: string,
  fetchImpl?: typeof fetch,
): Promise<Response> {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (userId !== undefined) headers.set('authorization', await bearer(userId));
  return handleRequest(
    new Request(new URL(path, 'https://example.com'), {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }),
    deps(store, fetchImpl),
  );
}

test('intake happy path saves a draft for the child parent', async () => {
  const store = churchStore();
  const logs: SafeLog[] = [];
  const response = await handleRequest(
    new Request(new URL('/v1/intake/profile', 'https://example.com'), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: await bearer(ids.avery),
      },
      body: JSON.stringify(intakeBody()),
    }),
    { ...deps(store), log: (event) => logs.push(event) },
  );
  assert.equal(response.status, 201);
  const body = (await response.json()) as { status: string; profile: { summary: string }; approvedBy: null };
  assert.equal(body.status, 'draft');
  assert.equal(body.approvedBy, null);
  assert.equal(body.profile.summary, sampleProfile().summary);
  assert.equal(store.profiles.size, 1);
  const saved = [...store.profiles.values()][0];
  assert.equal(saved?.status, 'draft');
  assert.equal(saved?.createdBy, ids.avery);
  assert.equal(JSON.stringify(logs).includes('SENSORY-NOTE-ORANGE-BLOCK'), false);
});

test('intake auth failures', async () => {
  const cases: Array<{ user?: string; child?: string; status: number; error: string }> = [
    { status: 401, error: 'unauthorized' },
    { user: ids.cameron, status: 403, error: 'forbidden' },
    { user: ids.devon, status: 403, error: 'forbidden' },
    { user: ids.blake, status: 403, error: 'forbidden' },
    { user: ids.outsider, status: 404, error: 'not_found' },
    { user: ids.avery, child: ids.quinn, status: 403, error: 'forbidden' },
    { user: ids.avery, child: '10000000-0000-4000-8000-000000000099', status: 404, error: 'not_found' },
  ];
  for (const item of cases) {
    const store = churchStore();
    const response = await post(
      store,
      '/v1/intake/profile',
      intakeBody(item.child === undefined ? {} : { childId: item.child }),
      item.user,
    );
    const body = (await response.json()) as { error: string };
    assert.equal(response.status, item.status, JSON.stringify(item));
    assert.equal(body.error, item.error);
    assert.equal(store.profiles.size, 0);
  }
});

test('intake rejects an invalid body before calling the model', async () => {
  let called = false;
  const store = churchStore();
  const response = await post(
    store,
    '/v1/intake/profile',
    { organizationId: ids.org, childId: ids.rowan, answers: { preferredName: 'Rowan' } },
    ids.avery,
    async () => {
      called = true;
      return chatEnvelope(sampleProfile());
    },
  );
  assert.equal(response.status, 400);
  assert.equal(called, false);
  assert.equal(store.profiles.size, 0);
});

test('intake does not save a profile when generation fails', async () => {
  const store = churchStore();
  const response = await post(store, '/v1/intake/profile', intakeBody(), ids.avery, async () => {
    return new Response('nope', { status: 500 });
  });
  assert.equal(response.status, 502);
  const body = (await response.json()) as { error: string };
  assert.equal(body.error, 'generation_failed');
  assert.equal(body.error.includes('SENSORY-NOTE-ORANGE-BLOCK'), false);
  assert.equal(store.profiles.size, 0);
});

test('approve lets only that child parent move draft to approved', async () => {
  const store = churchStore();
  const created = await post(store, '/v1/intake/profile', intakeBody(), ids.avery);
  const createdBody = (await created.json()) as { id: string };
  const denied: Array<{ user?: string; status: number }> = [
    { status: 401 },
    { user: ids.cameron, status: 403 },
    { user: ids.devon, status: 403 },
    { user: ids.blake, status: 403 },
    { user: ids.outsider, status: 404 },
  ];
  for (const item of denied) {
    const response = await post(store, `/v1/profiles/${createdBody.id}/approve`, {}, item.user);
    assert.equal(response.status, item.status, item.user ?? 'anonymous');
  }
  const approved = await post(store, `/v1/profiles/${createdBody.id}/approve`, {}, ids.avery);
  assert.equal(approved.status, 200);
  const body = (await approved.json()) as { status: string; approvedBy: string };
  assert.equal(body.status, 'approved');
  assert.equal(body.approvedBy, ids.avery);
  const again = await post(store, `/v1/profiles/${createdBody.id}/approve`, {}, ids.avery);
  assert.equal(again.status, 409);
});

test('unknown routes are not found', async () => {
  const store = churchStore();
  const response = await post(store, '/v1/other', {}, ids.avery);
  assert.equal(response.status, 404);
});
