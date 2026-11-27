import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ProfileId, ShownProfile } from '../web/lib/desk.ts';
import { childHeading, childPreferredName, initialVisit, reduceVisit, type Visit } from '../web/lib/visit.ts';

function shown(status: 'draft' | 'approved'): ShownProfile {
  return {
    id: '10000000-0000-4000-8000-000000000031' as ProfileId,
    status,
    sections: [{ heading: 'Summary', lines: ['Rowan, age 7.'] }],
    whatHelps: [],
  };
}

function say(visit: Visit, text: string): Visit {
  return reduceVisit(visit, { type: 'conversation', event: { type: 'answer', text } });
}

function approveIntake(visit: Visit, allergies = 'No known allergies'): Visit {
  let next = reduceVisit(visit, { type: 'conversation', event: { type: 'beginIntake' } });
  next = say(next, 'Rowan');
  next = say(next, '7');
  next = say(next, 'He likes a quiet hello.');
  next = say(next, 'Quiet blocks.');
  next = say(next, 'Surprise loud songs.');
  next = say(next, 'A warning before music, with a quiet seat nearby.');
  next = say(next, 'Picture cards.');
  next = say(next, 'TICK-QUIET-ROOM');
  next = say(next, 'Tells an adult');
  next = say(next, allergies);
  if (next.conversation.talk.mode === 'ask' && next.conversation.talk.nodeId === 'allergies-more') {
    next = say(next, 'A volunteer avoids peanuts.');
  }
  next = say(next, 'No, not usually');
  const profile = shown('draft');
  next = reduceVisit(next, { type: 'intake', event: { type: 'submit', nonce: 1 } });
  next = reduceVisit(next, { type: 'intake', event: { type: 'draft', profile, nonce: 1 } });
  next = reduceVisit(next, { type: 'intake', event: { type: 'approve' } });
  return reduceVisit(next, {
    type: 'intake',
    event: { type: 'approved', profile: { ...profile, status: 'approved' } },
  });
}

test('the heading is the child name and the card seeds from the answers', () => {
  const visit = approveIntake(initialVisit());
  assert.equal(childPreferredName(visit), 'Rowan');
  assert.equal(childHeading(childPreferredName(visit)), 'Rowan');
  assert.equal(childHeading('Rowan'), 'Rowan');
  assert.equal(visit.card.loves, 'Quiet blocks.');
  assert.equal(visit.card.communication, 'Picture cards.');
  assert.equal(visit.card.sensory, 'TICK-QUIET-ROOM.');
  assert.equal(visit.visibility.medical, false);
  assert.equal(visit.card.medical, '');
});

test('an allergy answer leaves medical empty', () => {
  const visit = approveIntake(initialVisit(), 'Peanuts');
  assert.equal(visit.card.allergies, 'Peanuts. A volunteer avoids peanuts.');
  assert.equal(visit.visibility.allergies, true);
  assert.equal(visit.card.medical, '');
  assert.equal(visit.visibility.medical, false);
  assert.equal(childPreferredName(visit), 'Rowan');
});
