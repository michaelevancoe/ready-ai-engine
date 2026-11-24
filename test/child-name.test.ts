import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AnswerDraft, ProfileId, ShownProfile } from '../web/lib/desk.ts';
import {
  childHeading,
  childPreferredName,
  initialVisit,
  reduceVisit,
  type Visit,
} from '../web/lib/visit.ts';

function shown(status: 'draft' | 'approved'): ShownProfile {
  return {
    id: '10000000-0000-4000-8000-000000000031' as ProfileId,
    status,
    sections: [{ heading: 'Summary', lines: ['Juniper, age 7.'] }],
  };
}

function approveIntake(visit: Visit, answers: AnswerDraft): Visit {
  const profile = shown('draft');
  let next = reduceVisit(visit, { type: 'intake', event: { type: 'submit', answers } });
  next = reduceVisit(next, { type: 'intake', event: { type: 'draft', profile } });
  next = reduceVisit(next, { type: 'intake', event: { type: 'approve' } });
  return reduceVisit(next, {
    type: 'intake',
    event: { type: 'approved', profile: { ...profile, status: 'approved' } },
  });
}

test('Juniper keeps her name and the intake lines replace the sample card', () => {
  const start = initialVisit();
  const visit = approveIntake(start, {
    ...start.intake.answers,
    preferredName: 'Juniper',
    sensoryNotes: 'TICK-QUIET-ROOM',
    supportNeeds: 'A picture before the change.',
  });
  assert.equal(childPreferredName(visit), 'Juniper');
  assert.equal(childHeading(childPreferredName(visit)), 'Juniper');
  assert.equal(childHeading('Rowan'), 'Rowan Sampleton');
  assert.equal(visit.card.sensory, 'TICK-QUIET-ROOM');
  assert.equal(visit.card.loves, '');
  assert.equal(visit.card.communication, 'A picture before the change.');
});

test('a blank preferred name is Rowan Sampleton', () => {
  const start = initialVisit();
  const visit = approveIntake(start, {
    ...start.intake.answers,
    preferredName: '   ',
  });
  assert.equal(childPreferredName(visit), 'Rowan');
  assert.equal(childHeading(childPreferredName(visit)), 'Rowan Sampleton');
});
