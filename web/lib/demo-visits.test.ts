import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AccountSession } from './account-store.ts';
import {
  draftSundayNote,
  leaderStep,
  seedEvents,
  volunteerStep,
  type VisitRecord,
} from './demo-visits.ts';
import { DemoStore } from './ready-store.ts';
import { selectReadyStore } from './select-store.ts';
import { childAgeYears, childPreferredName, initialVisit, reduceVisit, type Visit } from './visit.ts';

const ORDER = ['rowan', 'owen', 'nora', 'ezra', 'hazel', 'lucy'] as const;

const SIGN_OFF = 'Ms. Dana\nExample Harbor Fellowship';

const EXPECTED = {
  owen: { name: 'Owen', age: 8, leader: 'No brief yet', volunteer: 'No brief yet', sample: true },
  nora: { name: 'Nora', age: 6, leader: 'No notes yet', volunteer: 'Brief ready', sample: true },
  ezra: {
    name: 'Ezra',
    age: 7,
    leader: 'Ready to draft',
    volunteer: 'Brief ready \u00b7 Notes saved',
    sample: true,
  },
  hazel: {
    name: 'Hazel',
    age: 11,
    leader: 'Draft to approve',
    volunteer: 'Brief ready \u00b7 Notes saved',
    sample: true,
  },
  lucy: {
    name: 'Lucy',
    age: 10,
    leader: 'Sent to parent',
    volunteer: 'Brief ready \u00b7 Notes saved',
    sample: true,
  },
} as const;

function fold(id: keyof typeof EXPECTED): Visit {
  return seedEvents(id).reduce(reduceVisit, initialVisit());
}

function once(body: string): void {
  assert.equal(body.endsWith(SIGN_OFF), true);
  assert.equal(body.indexOf(SIGN_OFF), body.lastIndexOf(SIGN_OFF));
  assert.equal(body.indexOf(SIGN_OFF), body.length - SIGN_OFF.length);
}

test('demo boot lists Rowan and five sample visits at their steps', () => {
  const store = selectReadyStore({ mode: 'demo' });
  const records = store.listVisits();
  assert.deepEqual(
    records.map((record) => record.id),
    [...ORDER],
  );
  const rowan = records[0];
  assert.ok(rowan);
  assert.equal(rowan.sample, false);
  assert.equal(rowan.cannedDraft, null);
  assert.equal(rowan.visit.conversation.talk.mode, 'start');
  assert.equal(rowan.visit.brief.phase, 'approved');
  assert.equal(rowan.visit.notes, '');
  assert.equal(rowan.visit.update.phase, 'idle');
  if (rowan.visit.brief.phase === 'approved') {
    assert.equal(rowan.visit.brief.lines.some((line) => line.field === 'medical'), false);
    assert.equal(rowan.visit.brief.lines.some((line) => line.text.includes('Disney')), true);
  }
  assert.equal(leaderStep(rowan.visit), 'No notes yet');
  assert.equal(volunteerStep(rowan.visit), 'Brief ready');
  assert.equal(childPreferredName(rowan.visit), 'Rowan');
  assert.equal(childAgeYears(rowan.visit), 7);
  const started = reduceVisit(rowan.visit, { type: 'conversation', event: { type: 'beginIntake' } });
  assert.equal(started.brief.phase, 'open');
  assert.equal(started.conversation.talk.mode, 'ask');

  for (const record of records.slice(1)) {
    const expected = EXPECTED[record.id as keyof typeof EXPECTED];
    assert.equal(record.sample, expected.sample);
    assert.equal(childPreferredName(record.visit), expected.name);
    assert.equal(childAgeYears(record.visit), expected.age);
    assert.equal(leaderStep(record.visit), expected.leader);
    assert.equal(volunteerStep(record.visit), expected.volunteer);
    assert.deepEqual(record.visit, fold(record.id as keyof typeof EXPECTED));
  }

  const ezra = store.getVisit('ezra');
  const hazel = store.getVisit('hazel');
  const lucy = store.getVisit('lucy');
  assert.ok(ezra && hazel && lucy);
  assert.equal(ezra.visit.notes.includes('block tower'), true);
  assert.equal(ezra.visit.update.phase, 'idle');
  assert.equal(hazel.visit.update.phase, 'ready');
  assert.equal(lucy.visit.update.phase, 'approved');
  assert.ok(ezra.cannedDraft);
  assert.equal(hazel.cannedDraft, hazel.visit.update.phase === 'ready' ? hazel.visit.update.value.body : null);
  assert.equal(lucy.cannedDraft, lucy.visit.update.phase === 'approved' ? lucy.visit.update.value.body : null);
  once(ezra.cannedDraft);
  if (hazel.visit.update.phase === 'ready') once(hazel.visit.update.value.body);
  if (lucy.visit.update.phase === 'approved') once(lucy.visit.update.value.body);
  assert.equal(store.getVisit('owen')?.cannedDraft, null);
  assert.equal(store.getVisit('nora')?.cannedDraft, null);
  assert.equal(store.getVisit('missing'), null);
});

test('account boot lists the one saved visit and does not seed', () => {
  const parent: AccountSession = {
    userId: '10000000-0000-4000-8000-000000000011',
    accessToken: 'parent-token',
    role: 'parent',
  };
  const store = selectReadyStore({
    mode: 'account',
    sessions: [parent],
    scope: {
      organizationId: '10000000-0000-4000-8000-000000000001',
      childId: '10000000-0000-4000-8000-000000000021',
    },
    initial: initialVisit(),
    epoch: 4,
  });
  const records = store.listVisits();
  assert.equal(records.length, 1);
  assert.equal(records[0]?.id, '10000000-0000-4000-8000-000000000021');
  assert.equal(records[0]?.sample, false);
  assert.equal(records[0]?.cannedDraft, null);
  assert.equal(store.selectedId(), records[0]?.id);
  assert.deepEqual(records[0]?.visit, initialVisit());
  const names = records.map((record) => childPreferredName(record.visit));
  for (const name of ['Owen', 'Nora', 'Ezra', 'Hazel', 'Lucy']) {
    assert.equal(names.includes(name), false);
  }
});

test('select switches the active visit and a dispatch leaves the others in place', () => {
  const store = new DemoStore();
  const before = store.listVisits();
  const ezra = before[3];
  const rowan = before[0];
  assert.equal(ezra?.id, 'ezra');
  store.select('owen');
  assert.equal(store.selectedId(), 'owen');
  assert.equal(childPreferredName(store.getState()), 'Owen');
  store.select('nobody');
  assert.equal(store.selectedId(), 'owen');
  store.dispatch({ type: 'role', role: 'leader' });
  store.dispatch({ type: 'saveNotes', notes: 'Changed Owen only.' });
  const after = store.listVisits();
  assert.equal(after[0], rowan);
  assert.equal(after[3], ezra);
  assert.equal(after[3]?.visit, ezra?.visit);
  assert.equal(after[1]?.visit.notes, 'Changed Owen only.');
  assert.equal(after[2]?.visit.notes, '');
  assert.equal(store.getState().notes, 'Changed Owen only.');
});

test('a fresh demo store returns to the seeded start', () => {
  const started = new DemoStore().listVisits().map(plain);
  const store = new DemoStore();
  store.select('hazel');
  store.dispatch({ type: 'role', role: 'leader' });
  store.dispatch({ type: 'approveUpdate', body: 'Sent early.' });
  store.dispatch({ type: 'saveNotes', notes: 'Edited.' });
  assert.deepEqual(new DemoStore().listVisits().map(plain), started);
  assert.notDeepEqual(store.listVisits().map(plain), started);
});

test('seeded visits stay non-medical and only the five samples are marked', () => {
  for (const record of new DemoStore().listVisits()) {
    assert.equal(record.visit.visibility.medical, false);
    if (record.visit.brief.phase === 'approved') {
      for (const line of record.visit.brief.lines) {
        assert.notEqual(line.field, 'medical');
        assert.equal(line.text.toLowerCase().includes('medical'), false);
      }
    }
    assert.equal(record.sample, record.id !== 'rowan');
  }
});

test('a sample draft stays on the canned note and Rowan still posts', async () => {
  const calls: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push(url);
    throw new Error('offline');
  };
  try {
    const store = new DemoStore();
    const ezra = store.getVisit('ezra');
    assert.ok(ezra?.cannedDraft);
    const canned = await draftSundayNote(ezra, {
      notes: ezra.visit.notes,
      childName: 'Ezra',
      leader: 'Ms. Dana',
      church: 'Example Harbor Fellowship',
    });
    assert.equal(calls.length, 0);
    assert.equal(canned.ok, true);
    if (canned.ok) assert.equal(canned.value.body, ezra.cannedDraft);
    const rowan = store.getVisit('rowan');
    assert.ok(rowan);
    const posted = await draftSundayNote(rowan, {
      notes: 'A quiet corner.',
      childName: 'Rowan',
      leader: 'Ms. Dana',
      church: 'Example Harbor Fellowship',
    });
    assert.equal(posted.ok, false);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.includes('/v1/drafts/sunday-update'), true);
  } finally {
    globalThis.fetch = original;
  }
});

function plain(record: VisitRecord): { id: string; sample: boolean; notes: string; brief: Visit['brief']; update: Visit['update'] } {
  return {
    id: record.id,
    sample: record.sample,
    notes: record.visit.notes,
    brief: record.visit.brief,
    update: record.visit.update,
  };
}
