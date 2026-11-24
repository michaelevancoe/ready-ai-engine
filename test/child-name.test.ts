import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ProfileId, ShownProfile } from '../web/lib/desk.ts';
import { childHeading, childPreferredName, initialVisit, reduceVisit, type Visit } from '../web/lib/visit.ts';

function shown(status: 'draft' | 'approved'): ShownProfile {
  return {
    id: '10000000-0000-4000-8000-000000000031' as ProfileId,
    status,
    sections: [{ heading: 'Summary', lines: ['Rowan, age 7.'] }],
  };
}

function say(visit: Visit, text: string): Visit {
  return reduceVisit(visit, { type: 'conversation', event: { type: 'answer', text } });
}

function approveIntake(visit: Visit, medical?: string): Visit {
  let next = say(visit, 'He likes a quiet hello.');
  next = say(next, 'Quiet blocks.');
  next = say(next, 'Surprise loud songs.');
  next = say(next, 'A warning before music.');
  next = reduceVisit(next, { type: 'conversation', event: { type: 'skip' } });
  next = say(next, 'Picture cards.');
  next = say(next, 'TICK-QUIET-ROOM');
  if (medical === undefined) {
    next = reduceVisit(next, { type: 'conversation', event: { type: 'declineMedical' } });
  } else {
    next = reduceVisit(next, { type: 'conversation', event: { type: 'acceptMedical' } });
    next = say(next, medical);
  }
  const profile = shown('draft');
  next = reduceVisit(next, { type: 'intake', event: { type: 'submit', nonce: 1 } });
  next = reduceVisit(next, { type: 'intake', event: { type: 'draft', profile, nonce: 1 } });
  next = reduceVisit(next, { type: 'intake', event: { type: 'approve' } });
  return reduceVisit(next, {
    type: 'intake',
    event: { type: 'approved', profile: { ...profile, status: 'approved' } },
  });
}

test('the tree name is Rowan Sampleton and the card seeds from the answers', () => {
  const visit = approveIntake(initialVisit());
  assert.equal(childPreferredName(visit), 'Rowan');
  assert.equal(childHeading(childPreferredName(visit)), 'Rowan Sampleton');
  assert.equal(childHeading('Rowan'), 'Rowan Sampleton');
  assert.equal(visit.card.loves, 'Quiet blocks.');
  assert.equal(visit.card.communication, 'Picture cards.');
  assert.equal(visit.card.sensory, 'TICK-QUIET-ROOM');
  assert.equal(visit.visibility.medical, false);
  assert.equal(visit.card.medical, '');
});

test('a medical answer does not turn the switch on', () => {
  const visit = approveIntake(initialVisit(), 'TICK-MEDICAL-NOTE');
  assert.equal(visit.card.medical, 'TICK-MEDICAL-NOTE');
  assert.equal(visit.visibility.medical, false);
  assert.equal(childPreferredName(visit), 'Rowan');
});
