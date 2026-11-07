import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SupabaseStore } from '../src/supabase-store.ts';
import { ids, sampleProfile, testEnv } from './fixtures.ts';

test('supabase store forwards the user JWT and writes a draft', async () => {
  const calls: Array<{ url: string; method: string; headers: Headers; body: string | undefined }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const headers = new Headers(init?.headers);
    calls.push({ url, method: init?.method ?? 'GET', headers, body: typeof init?.body === 'string' ? init.body : undefined });
    if (init?.method === 'POST') {
      return new Response(
        JSON.stringify([
          {
            id: ids.draftProfile,
            organization_id: ids.org,
            child_id: ids.rowan,
            status: 'draft',
            profile: sampleProfile(),
            created_by: ids.avery,
            approved_by: null,
          },
        ]),
        { status: 201 },
      );
    }
    return new Response(JSON.stringify([]), { status: 200 });
  };

  const store = new SupabaseStore({
    supabaseUrl: testEnv.SUPABASE_URL,
    anonKey: testEnv.SUPABASE_ANON_KEY,
    accessToken: 'user-jwt',
    fetch: fetchImpl,
  });
  const saved = await store.insertDraft({
    organizationId: ids.org,
    childId: ids.rowan,
    profile: sampleProfile(),
    createdBy: ids.avery,
  });
  assert.equal(saved.status, 'draft');
  assert.equal(calls.length, 1);
  const call = calls[0];
  assert.ok(call);
  assert.equal(call.method, 'POST');
  assert.ok(call.url.startsWith(`${testEnv.SUPABASE_URL}/rest/v1/child_profiles`));
  assert.equal(call.headers.get('authorization'), 'Bearer user-jwt');
  assert.equal(call.headers.get('apikey'), testEnv.SUPABASE_ANON_KEY);
  assert.equal(call.headers.get('prefer'), 'return=representation');
  const body = JSON.parse(call.body ?? '{}') as { status: string };
  assert.equal(body.status, 'draft');
  assert.equal(JSON.stringify(calls).includes('service_role'), false);
});
