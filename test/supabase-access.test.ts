import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { handleRequest, type AppDeps } from '../src/app.ts';
import { supabaseAccessSource } from '../src/supabase-access.ts';
import { supabaseAuthVerifier } from '../src/supabase-auth.ts';
import { churchStore, testEnv } from './fixtures.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const userId = '10000000-0000-4000-8000-0000000000c1';
const childId = '10000000-0000-4000-8000-0000000000d1';
const briefId = '10000000-0000-4000-8000-0000000000b1';
const orgId = '10000000-0000-4000-8000-0000000000a1';
const lessonId = '10000000-0000-4000-8000-0000000000e1';
const inviteId = '10000000-0000-4000-8000-0000000000f1';
const token = 'session-parent-harbor';

interface Call {
  url: string;
  apikey: string | null;
  authorization: string | null;
  body: string | null;
  redirect: string | undefined;
}

function deps(fetchImpl: typeof fetch, flag: 'on' | 'off' = 'on'): AppDeps {
  return {
    env: flag === 'off' ? testEnv : { ...testEnv, READY_SIGN_IN: 'on' },
    fetch: fetchImpl,
    storeFactory: () => churchStore(),
    log: () => undefined,
    auth: supabaseAuthVerifier({
      supabaseUrl: testEnv.SUPABASE_URL,
      anonKey: testEnv.SUPABASE_ANON_KEY,
      fetch: fetchImpl,
      timeoutMs: 50,
    }),
    accessSource: supabaseAccessSource({
      supabaseUrl: testEnv.SUPABASE_URL,
      anonKey: testEnv.SUPABASE_ANON_KEY,
      fetch: fetchImpl,
      timeoutMs: 50,
    }),
  };
}

function send(fetchImpl: typeof fetch, method: string, path: string, body?: unknown, session = token): Promise<Response> {
  const headers = new Headers({ authorization: `Bearer ${session}` });
  if (body !== undefined) headers.set('content-type', 'application/json');
  return handleRequest(
    new Request(new URL(path, 'https://example.com'), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    deps(fetchImpl),
  );
}

function router(routes: Record<string, unknown>, calls: Call[]): typeof fetch {
  return async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const headers = new Headers(init?.headers);
    calls.push({
      url,
      apikey: headers.get('apikey'),
      authorization: headers.get('authorization'),
      body: typeof init?.body === 'string' ? init.body : null,
      redirect: init?.redirect,
    });
    if (url.endsWith('/auth/v1/user')) {
      return new Response(JSON.stringify({ id: userId, role: 'service_role' }), { status: 200 });
    }
    const path = new URL(url).pathname;
    const payload = routes[path];
    if (payload === undefined) return new Response('[]', { status: 200 });
    return new Response(JSON.stringify(payload), { status: 200 });
  };
}

test('the worker entry reads tables with the user token and does not keep an in-memory world', () => {
  const source = readFileSync(join(root, 'src/index.ts'), 'utf8');
  const app = readFileSync(join(root, 'src/app.ts'), 'utf8');
  const access = readFileSync(join(root, 'src/access.ts'), 'utf8');
  assert.equal(source.includes('supabaseAccessSource'), true);
  assert.equal(source.includes('accessWorld'), false);
  assert.equal(source.includes('service_role'), false);
  assert.equal(app.includes('accessWorld'), false);
  assert.equal(access.includes('runAccess'), false);
});

test('flag off does not call Auth or the tables when a source is configured', async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    return new Response('[]', { status: 200 });
  };
  const response = await handleRequest(
    new Request('https://example.com/v1/access/membership', {
      headers: { authorization: `Bearer ${token}` },
    }),
    deps(fetchImpl, 'off'),
  );
  assert.equal(response.status, 404);
  assert.equal(await response.text(), '{"error":"not_found"}');
  assert.equal(calls, 0);
});

test('a membership read sends the anon key and the user bearer token', async () => {
  const calls: Call[] = [];
  const response = await send(
    router({ '/rest/v1/memberships': [{ role: 'parent' }] }, calls),
    'GET',
    '/v1/access/membership',
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { role: 'parent' });
  const table = calls.find((call) => call.url.includes('/rest/v1/memberships'));
  assert.ok(table);
  assert.equal(table.apikey, testEnv.SUPABASE_ANON_KEY);
  assert.equal(table.authorization, `Bearer ${token}`);
  assert.equal(table.redirect, 'manual');
  assert.equal(table.url.includes(`user_id=eq.${userId}`), true);
  assert.equal(calls.some((call) => call.url.endsWith('/auth/v1/user')), true);
});

test('an empty child read is not found and a brief takes medical from medical notes', async () => {
  const hidden = await send(router({ '/rest/v1/children': [] }, []), 'GET', `/v1/access/children/${childId}`);
  assert.equal(hidden.status, 404);
  assert.equal(await hidden.text(), '{"error":"not_found"}');

  const lines = [
    { field: 'loves', text: 'HARBOR-LOVES' },
    { field: 'medical', text: 'BRIEF-MEDICAL' },
  ];
  const calls: Call[] = [];
  const before = await send(
    router(
      {
        '/rest/v1/shared_briefs': [{ id: briefId, child_id: childId, lines }],
        '/rest/v1/medical_notes': [],
      },
      calls,
    ),
    'GET',
    `/v1/access/briefs/${briefId}`,
  );
  assert.deepEqual(await before.json(), { id: briefId, lines: [{ field: 'loves', text: 'HARBOR-LOVES' }] });
  assert.equal(calls.some((call) => call.url.includes('/rest/v1/medical_notes')), true);
  assert.equal(calls.some((call) => call.url.includes('medical_visible')), false);

  const after = await send(
    router(
      {
        '/rest/v1/shared_briefs': [{ id: briefId, child_id: childId, lines }],
        '/rest/v1/medical_notes': [{ note: 'HARBOR-MEDICAL' }],
      },
      [],
    ),
    'GET',
    `/v1/access/briefs/${briefId}`,
  );
  assert.deepEqual(await after.json(), {
    id: briefId,
    lines: [
      { field: 'loves', text: 'HARBOR-LOVES' },
      { field: 'medical', text: 'HARBOR-MEDICAL' },
    ],
  });
});

test('a table redirect is not followed', async () => {
  let calls = 0;
  const redirect: typeof fetch = async (input, init) => {
    calls += 1;
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    assert.equal(init?.redirect, 'manual');
    if (url.endsWith('/auth/v1/user')) return new Response(JSON.stringify({ id: userId }), { status: 200 });
    return new Response(null, { status: 302, headers: { location: 'https://example.com/elsewhere' } });
  };
  const moved = await send(redirect, 'GET', '/v1/access/membership');
  assert.equal(moved.status, 401);
  assert.equal(calls, 2);
});

test('church and lesson reads return only the row the table returned', async () => {
  const church = await send(
    router({ '/rest/v1/church_setup': [{ organization_id: orgId, name: 'HARBOR-CHURCH' }] }, []),
    'GET',
    `/v1/access/churches/${orgId}`,
  );
  assert.deepEqual(await church.json(), { organizationId: orgId, name: 'HARBOR-CHURCH' });
  const missing = await send(router({ '/rest/v1/church_setup': [] }, []), 'GET', `/v1/access/churches/${orgId}`);
  assert.equal(missing.status, 404);
  const lesson = await send(
    router({ '/rest/v1/lessons': [{ id: lessonId, title: 'HARBOR-LESSON' }] }, []),
    'GET',
    `/v1/access/lessons/${lessonId}`,
  );
  assert.deepEqual(await lesson.json(), { id: lessonId, title: 'HARBOR-LESSON' });
});

test('register refuses any role other than parent before it calls the database', async () => {
  const calls: Call[] = [];
  const denied = await send(router({}, calls), 'POST', '/v1/access/register', {
    organizationId: orgId,
    role: 'leader',
  });
  assert.equal(denied.status, 403);
  assert.equal(calls.some((call) => call.url.includes('self_register_parent')), false);

  const created = await send(router({ '/rest/v1/rpc/self_register_parent': true }, []), 'POST', '/v1/access/register', {
    organizationId: orgId,
    role: 'parent',
  });
  assert.equal(created.status, 201);
  assert.deepEqual(await created.json(), { role: 'parent' });

  const again = await send(router({ '/rest/v1/rpc/self_register_parent': false }, []), 'POST', '/v1/access/register', {
    organizationId: orgId,
    role: 'parent',
  });
  assert.equal(again.status, 200);
  assert.deepEqual(await again.json(), { role: 'parent' });
});

test('invite and accept use the security-definer results', async () => {
  const calls: Call[] = [];
  const invite = await send(
    router({ '/rest/v1/rpc/create_invite': inviteId }, calls),
    'POST',
    '/v1/access/invites',
    { organizationId: orgId, role: 'volunteer' },
  );
  assert.equal(invite.status, 201);
  assert.deepEqual(await invite.json(), { id: inviteId, role: 'volunteer' });
  const inviteBody = calls.find((call) => call.url.includes('create_invite'))?.body;
  assert.equal(inviteBody, JSON.stringify({ target_org: orgId, invite_role: 'volunteer' }));

  const claimed = await send(
    (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.endsWith('/auth/v1/user')) return Promise.resolve(new Response(JSON.stringify({ id: userId }), { status: 200 }));
      if (url.includes('accept_invite')) {
        const body = typeof init?.body === 'string' ? init.body : '';
        assert.equal(body.includes('"claimed_role":"leader"'), true);
        return Promise.resolve(new Response(JSON.stringify({ code: 'P0001', message: 'forbidden' }), { status: 400 }));
      }
      return Promise.resolve(new Response('[]', { status: 200 }));
    },
    'POST',
    `/v1/access/invites/${inviteId}/accept`,
    { role: 'leader' },
  );
  assert.equal(claimed.status, 403);

  const missingFetch: typeof fetch = async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url.endsWith('/auth/v1/user')) return new Response(JSON.stringify({ id: userId }), { status: 200 });
    return new Response(JSON.stringify({ code: 'P0001', message: 'not_found' }), { status: 400 });
  };
  const missingInvite = await send(missingFetch, 'POST', `/v1/access/invites/${inviteId}/accept`, {});
  assert.equal(missingInvite.status, 404);

  const accepted = await send(
    router({ '/rest/v1/rpc/accept_invite': { role: 'volunteer', created: true } }, []),
    'POST',
    `/v1/access/invites/${inviteId}/accept`,
    {},
  );
  assert.equal(accepted.status, 201);
  assert.deepEqual(await accepted.json(), { role: 'volunteer' });
  const repeat = await send(
    router({ '/rest/v1/rpc/accept_invite': { role: 'volunteer', created: false } }, []),
    'POST',
    `/v1/access/invites/${inviteId}/accept`,
    {},
  );
  assert.equal(repeat.status, 200);
});

test('a grant maps not_found, forbidden, and a stored grant', async () => {
  const missing: typeof fetch = async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url.endsWith('/auth/v1/user')) return new Response(JSON.stringify({ id: userId }), { status: 200 });
    return new Response(JSON.stringify({ code: 'P0001', message: 'not_found' }), { status: 400 });
  };
  const absent = await send(missing, 'POST', '/v1/access/medical-grants', { childId });
  assert.equal(absent.status, 404);
  const denied: typeof fetch = async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url.endsWith('/auth/v1/user')) return new Response(JSON.stringify({ id: userId }), { status: 200 });
    return new Response(JSON.stringify({ code: 'P0001', message: 'forbidden' }), { status: 400 });
  };
  const blocked = await send(denied, 'POST', '/v1/access/medical-grants', { childId });
  assert.equal(blocked.status, 403);
  const granted = await send(router({ '/rest/v1/rpc/grant_medical': null }, []), 'POST', '/v1/access/medical-grants', {
    childId,
  });
  assert.equal(granted.status, 200);
  assert.deepEqual(await granted.json(), { granted: true });
});

test('auth and table calls time out as 504 and a network failure is 503', async () => {
  const hanging: typeof fetch = (_input, init) =>
    new Promise((_resolve, reject) => {
      const signal = init?.signal;
      if (signal === undefined || signal === null) {
        reject(new TypeError('missing timeout'));
        return;
      }
      const fail = (): void => {
        reject(new DOMException('timed out', 'TimeoutError'));
      };
      if (signal.aborted) {
        fail();
        return;
      }
      signal.addEventListener('abort', fail, { once: true });
    });
  const timed = await send(hanging, 'GET', '/v1/access/membership');
  assert.equal(timed.status, 504);
  assert.deepEqual(await timed.json(), { error: 'timeout' });

  const offline: typeof fetch = async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url.endsWith('/auth/v1/user')) return new Response(JSON.stringify({ id: userId }), { status: 200 });
    throw new TypeError('network down');
  };
  const down = await send(offline, 'GET', '/v1/access/membership');
  assert.equal(down.status, 503);
  assert.deepEqual(await down.json(), { error: 'unavailable' });
});
