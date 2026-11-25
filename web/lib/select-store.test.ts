import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AccountSession } from './account-store.ts';
import { selectReadyStore } from './select-store.ts';
import { initialVisit } from './visit.ts';

const scope = {
  organizationId: '10000000-0000-4000-8000-000000000001',
  childId: '10000000-0000-4000-8000-000000000021',
};

test('demo boot keeps each visit in memory', () => {
  const store = selectReadyStore({ mode: 'demo' });
  store.dispatch({ type: 'saveNotes', notes: 'A quiet corner.' });
  assert.equal(store.getState().notes, 'A quiet corner.');
  assert.equal(selectReadyStore({ mode: 'demo' }).getState().notes, '');
});

test('account boot posts the acting bearer to visit sync', async () => {
  const calls: { url: string; authorization: string | null; body: string }[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    calls.push({
      url: typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url,
      authorization: headers.get('authorization'),
      body: typeof init?.body === 'string' ? init.body : '',
    });
    return new Response(null, { status: 204 });
  };
  try {
    const sessions: readonly AccountSession[] = [
      { userId: '10000000-0000-4000-8000-000000000011', accessToken: 'parent-token', role: 'parent' },
      { userId: '10000000-0000-4000-8000-000000000013', accessToken: 'volunteer-token', role: 'volunteer' },
    ];
    const store = selectReadyStore({ mode: 'account', sessions, scope, initial: initialVisit() });
    store.dispatch({ type: 'saveNotes', notes: 'A quiet corner.' });
    await Promise.resolve();
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, '/visit-sync');
    assert.equal(calls[0]?.authorization, 'Bearer volunteer-token');
    assert.equal(calls[0]?.body.includes('A quiet corner.'), true);
    assert.equal(calls[0]?.body.includes('parent-token'), false);
  } finally {
    globalThis.fetch = original;
  }
});
