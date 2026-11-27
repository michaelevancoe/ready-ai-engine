import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AccountSession } from './account-store.ts';
import {
  LEADER_STEPS,
  SEEDED_CHILDREN,
  VOLUNTEER_STEPS,
  leaderTagKind,
  seededChildren,
} from './demo-roster.ts';
import { DemoStore } from './ready-store.ts';
import { demoMode, type StoreBoot } from './select-store.ts';
import { initialVisit } from './visit.ts';

const retired = ['El' + 'i', 'Sam' + ' Rivera'] as const;
const blocked = ['Rowan', 'Maya', 'Jonah', 'Quinn', 'Theo', 'Sampleton', ...retired];

test('five seeded children cover every roster step', () => {
  assert.equal(SEEDED_CHILDREN.length, 5);
  assert.equal(new Set(SEEDED_CHILDREN.map((child) => child.name)).size, SEEDED_CHILDREN.length);
  for (const child of SEEDED_CHILDREN) {
    assert.equal(child.ageYears >= 5 && child.ageYears <= 12, true, child.name);
  }
  assert.deepEqual([...LEADER_STEPS], [
    'No brief yet',
    'No notes yet',
    'Notes from Jordan',
    'Draft to approve',
    'Sent to parent',
  ]);
  assert.deepEqual([...VOLUNTEER_STEPS], ['No brief yet', 'Brief ready', 'Brief ready \u00b7 Notes saved']);
  for (const step of LEADER_STEPS) {
    assert.equal(
      SEEDED_CHILDREN.some((child) => child.leader === step),
      true,
      step,
    );
  }
  for (const step of VOLUNTEER_STEPS) {
    assert.equal(
      SEEDED_CHILDREN.some((child) => child.volunteer === step),
      true,
      step,
    );
  }
  assert.equal(leaderTagKind('No brief yet'), 'plain');
  assert.equal(leaderTagKind('No notes yet'), 'plain');
  assert.equal(leaderTagKind('Notes from Jordan'), 'ready');
  assert.equal(leaderTagKind('Draft to approve'), 'ready');
  assert.equal(leaderTagKind('Sent to parent'), 'approved');
});

test('seeded names stay clear of the live examples', () => {
  for (const child of SEEDED_CHILDREN) {
    const name = child.name.toLowerCase();
    for (const needle of blocked) {
      assert.equal(name.includes(needle.toLowerCase()), false, child.name);
    }
  }
});

test('seededChildren drops only the trimmed live name', () => {
  assert.deepEqual(
    seededChildren('nora').map((child) => child.name),
    ['Owen', 'Ezra', 'Hazel', 'Lucy'],
  );
  assert.deepEqual(
    seededChildren(' Nora ').map((child) => child.name),
    ['Owen', 'Ezra', 'Hazel', 'Lucy'],
  );
  assert.deepEqual(
    seededChildren('Rowan').map((child) => child.name),
    ['Owen', 'Nora', 'Ezra', 'Hazel', 'Lucy'],
  );
  assert.equal(seededChildren('Rowan').length, 5);
  assert.notEqual(seededChildren('Rowan'), SEEDED_CHILDREN);
  assert.deepEqual(
    SEEDED_CHILDREN.map((child) => child.name),
    ['Owen', 'Nora', 'Ezra', 'Hazel', 'Lucy'],
  );
});

test('the seeded roster stays frozen', () => {
  assert.equal(Object.isFrozen(SEEDED_CHILDREN), true);
  for (const child of SEEDED_CHILDREN) assert.equal(Object.isFrozen(child), true);
});

test('a live visit dispatch leaves the seeded rows unchanged', () => {
  const before = SEEDED_CHILDREN.map((child) => ({ ...child }));
  const store = new DemoStore();
  store.dispatch({ type: 'saveNotes', notes: 'Kept to the live child.' });
  store.dispatch({ type: 'role', role: 'leader' });
  store.dispatch({ type: 'approveUpdate', body: 'Sent.' });
  assert.deepEqual(
    SEEDED_CHILDREN.map((child) => ({ ...child })),
    before,
  );
  assert.equal(store.getState().notes, 'Kept to the live child.');
});

test('seeded rows are for demo mode only', () => {
  assert.equal(demoMode({ mode: 'demo' }), true);
  const parent: AccountSession = {
    userId: '10000000-0000-4000-8000-000000000011',
    accessToken: 'parent-token',
    role: 'parent',
  };
  const account: StoreBoot = {
    mode: 'account',
    sessions: [parent],
    scope: {
      organizationId: '10000000-0000-4000-8000-000000000001',
      childId: '10000000-0000-4000-8000-000000000021',
    },
    initial: initialVisit(),
    epoch: 0,
  };
  assert.equal(demoMode(account), false);
});
