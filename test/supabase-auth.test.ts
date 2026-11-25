import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleRequest, type AppDeps } from '../src/app.ts';
import { supabaseAccessSource } from '../src/supabase-access.ts';
import { supabaseAuthVerifier } from '../src/supabase-auth.ts';
import { churchStore, testEnv } from './fixtures.ts';

const userId = '10000000-0000-4000-8000-000000000101';
const orgId = '10000000-0000-4000-8000-0000000000a1';
const token = 'session-parent-harbor';

function deps(flag: string | undefined, fetchImpl: typeof fetch, auth = supabaseAuthVerifier({
  supabaseUrl: testEnv.SUPABASE_URL,
  anonKey: testEnv.SUPABASE_ANON_KEY,
  fetch: fetchImpl,
})): AppDeps {
  return {
    env: flag === undefined ? testEnv : { ...testEnv, READY_SIGN_IN: flag },
    fetch: fetchImpl,
    storeFactory: () => churchStore(),
    log: () => undefined,
    auth,
    accessSource: supabaseAccessSource({
      supabaseUrl: testEnv.SUPABASE_URL,
      anonKey: testEnv.SUPABASE_ANON_KEY,
      fetch: fetchImpl,
    }),
  };
}

function send(fetchImpl: typeof fetch, method: string, path: string, session?: string): Promise<Response> {
  const headers = new Headers();
  if (session !== undefined) headers.set('authorization', `Bearer ${session}`);
  return handleRequest(
    new Request(new URL(path, 'https://example.com'), { method, headers }),
    deps('on', fetchImpl),
  );
}

test('the adapter asks Auth for the user and ignores role claims', async () => {
  const calls: string[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push(url);
    if (url.endsWith('/auth/v1/user')) {
      return new Response(
        JSON.stringify({
          id: userId,
          role: 'service_role',
          app_metadata: { role: 'leader' },
          contact: 'person-marker',
        }),
        { status: 200 },
      );
    }
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('authorization'), `Bearer ${token}`);
    assert.equal(headers.has('x-role'), false);
    return new Response(JSON.stringify([{ organization_id: orgId, role: 'parent' }]), { status: 200 });
  };
  const own = await send(fetchImpl, 'GET', '/v1/access/membership', token);
  assert.equal(own.status, 200);
  assert.deepEqual(await own.json(), { role: 'parent' });
  assert.equal(calls[0], `${testEnv.SUPABASE_URL}/auth/v1/user`);
  assert.equal(calls.some((url) => url.includes('/rest/v1/memberships')), true);
});

test('a rejected Auth session stays unauthorized and does not read tables', async () => {
  const calls: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push(url);
    return new Response(JSON.stringify({ message: 'bad session' }), { status: 401 });
  };
  const missing = await send(fetchImpl, 'GET', '/v1/access/membership');
  assert.equal(missing.status, 401);
  const unknown = await send(fetchImpl, 'GET', '/v1/access/membership', 'session-unknown');
  assert.equal(unknown.status, 401);
  const asUserId = await send(fetchImpl, 'GET', '/v1/access/membership', userId);
  assert.equal(asUserId.status, 401);
  assert.equal(calls.every((url) => url.endsWith('/auth/v1/user')), true);
  assert.equal(calls.length, 2);
});

test('the adapter rejects a non-user id, a redirect, and a blank project', async () => {
  const badId: typeof fetch = async () =>
    new Response(JSON.stringify({ id: 'not-a-user', role: 'leader' }), { status: 200 });
  const bad = await send(badId, 'GET', '/v1/access/membership', token);
  assert.equal(bad.status, 401);

  let redirects = 0;
  const redirect: typeof fetch = async () => {
    redirects += 1;
    return new Response(null, { status: 302, headers: { location: 'https://example.com/elsewhere' } });
  };
  const moved = await send(redirect, 'GET', '/v1/access/membership', token);
  assert.equal(moved.status, 401);
  assert.equal(redirects, 1);

  let blanks = 0;
  const blankFetch: typeof fetch = async () => {
    blanks += 1;
    return new Response(null, { status: 200 });
  };
  const closed = await handleRequest(
    new Request('https://example.com/v1/access/membership', {
      headers: { authorization: `Bearer ${token}` },
    }),
    deps(
      'on',
      blankFetch,
      supabaseAuthVerifier({ supabaseUrl: '  ', anonKey: '  ', fetch: blankFetch }),
    ),
  );
  assert.equal(closed.status, 401);
  assert.equal(blanks, 0);
});

test('the flag off path does not call Auth', async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ id: userId }), { status: 200 });
  };
  const response = await handleRequest(
    new Request('https://example.com/v1/access/membership', {
      headers: { authorization: `Bearer ${token}` },
    }),
    deps(undefined, fetchImpl),
  );
  const text = await response.text();
  assert.equal(response.status, 404);
  assert.equal(text, '{"error":"not_found"}');
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
    const ok: typeof fetch = async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.endsWith('/auth/v1/user')) {
        return new Response(
          JSON.stringify({ id: userId, role: 'service_role', contact: 'person-marker' }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify([{ organization_id: orgId, role: 'parent' }]), { status: 200 });
    };
    const rejected: typeof fetch = async () =>
      new Response(JSON.stringify({ message: 'bad session', contact: 'person-marker' }), { status: 401 });
    await send(ok, 'GET', '/v1/access/membership', token);
    await send(rejected, 'GET', '/v1/access/membership', 'session-unknown');
  } finally {
    console.log = log;
    console.error = error;
  }
  const blob = lines.join('\n');
  assert.equal(blob.includes('person-marker'), false);
  assert.equal(blob.includes('session-parent-harbor'), false);
  assert.equal(blob.includes(userId), false);
  assert.equal(blob.includes('service_role'), false);
  assert.equal(blob.includes('@'), false);
});
