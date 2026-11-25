import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AccountStore, type AccountSession, type VisitGateway } from './account-store.ts';
import type { AccountScope, PersistPlan } from './persist-visit.ts';
import { initialVisit } from './visit.ts';

const scope: AccountScope = {
  organizationId: '10000000-0000-4000-8000-000000000001',
  childId: '10000000-0000-4000-8000-000000000021',
};

const parent: AccountSession = { userId: '10000000-0000-4000-8000-000000000011', accessToken: 'parent-token', role: 'parent' };
const volunteer: AccountSession = {
  userId: '10000000-0000-4000-8000-000000000013',
  accessToken: 'volunteer-token',
  role: 'volunteer',
};
const leader: AccountSession = { userId: '10000000-0000-4000-8000-000000000014', accessToken: 'leader-token', role: 'leader' };

test('a no-op does not write and notes use the volunteer session', () => {
  const saved: { role: string; plan: PersistPlan }[] = [];
  const gateway: VisitGateway = {
    save(session, _scope, plan) {
      saved.push({ role: session.role, plan });
    },
  };
  const store = new AccountStore([parent, volunteer, leader], scope, gateway, initialVisit());
  let calls = 0;
  store.subscribe(() => {
    calls += 1;
  });
  store.dispatch({ type: 'role', role: 'parent' });
  assert.equal(calls, 0);
  assert.equal(saved.length, 0);
  store.dispatch({ type: 'saveNotes', notes: 'A quiet corner.' });
  assert.equal(calls, 1);
  assert.equal(saved.length, 1);
  assert.equal(saved[0]?.role, 'volunteer');
  assert.equal(saved[0]?.plan.notes?.body, 'A quiet corner.');
  store.dispatch({ type: 'saveNotes', notes: 'A quiet corner.' });
  assert.equal(saved.length, 1);
  assert.equal(store.getState().notes, 'A quiet corner.');
});

test('a visit still updates when the owning session is absent', () => {
  let calls = 0;
  const gateway: VisitGateway = {
    save() {
      calls += 1;
    },
  };
  const store = new AccountStore([parent], scope, gateway, initialVisit());
  store.dispatch({ type: 'saveNotes', notes: 'Kept on the visit.' });
  assert.equal(store.getState().notes, 'Kept on the visit.');
  assert.equal(calls, 0);
});
