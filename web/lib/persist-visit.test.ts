import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyPlan, persistDispatch, type AccountScope } from './persist-visit.ts';
import { briefLines, initialVisit, reduceVisit, type Visit } from './visit.ts';

const scope: AccountScope = {
  organizationId: '10000000-0000-4000-8000-000000000001',
  childId: '10000000-0000-4000-8000-000000000021',
};

test('a role change does not settle a row', () => {
  const start = initialVisit();
  const leader = reduceVisit(start, { type: 'role', role: 'leader' });
  assert.equal(emptyPlan(persistDispatch(start, leader, scope)), true);
  assert.equal(persistDispatch(start, leader, scope).notes, null);
});

test('an example does not save or delete the account child', () => {
  const child: Visit = {
    ...initialVisit(),
    card: { ...initialVisit().card, loves: 'Trains' },
    brief: {
      phase: 'approved',
      lines: [{ field: 'loves', label: 'Loves', text: 'Trains' }],
    },
    notes: 'Quiet trains.',
  };
  const opened = reduceVisit(child, { type: 'conversation', event: { type: 'openExample', id: 'maya' } });
  assert.equal(emptyPlan(persistDispatch(child, opened, scope)), true);
  const closed = reduceVisit(opened, { type: 'conversation', event: { type: 'leaveExample' } });
  assert.equal(emptyPlan(persistDispatch(opened, closed, scope)), true);
  assert.equal(child.notes, 'Quiet trains.');
  assert.equal(child.brief.phase, 'approved');
  if (child.brief.phase !== 'approved') return;
  assert.equal(child.brief.lines[0]?.text, 'Trains');
});

test('published lines omit medical and notes keep the child scope', () => {
  const start = initialVisit();
  const card = { ...start.card, loves: 'Trains', medical: 'Secret' };
  const visibility = { ...start.visibility, medical: true };
  const approved: Visit = {
    ...start,
    card,
    visibility,
    cardTouched: true,
    brief: { phase: 'approved', lines: briefLines(card, visibility) },
  };
  const plan = persistDispatch(start, approved, scope);
  assert.equal(plan.publication?.action, 'upsert');
  if (plan.publication?.action !== 'upsert') return;
  assert.deepEqual(
    plan.publication.lines.map((line) => line.field),
    ['loves'],
  );
  assert.equal(plan.brief?.childId, scope.childId);
  const noted = reduceVisit(start, { type: 'saveNotes', notes: 'A quiet corner.' });
  assert.equal(persistDispatch(start, noted, scope).notes?.body, 'A quiet corner.');
});
