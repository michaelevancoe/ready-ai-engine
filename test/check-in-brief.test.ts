import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ProfileId, ShownProfile } from '../web/lib/desk.ts';
import {
  checkInBrief,
  initialVisit,
  reduceVisit,
  type ProfileCard,
  type Visit,
} from '../web/lib/visit.ts';

function shown(status: 'draft' | 'approved'): ShownProfile {
  return {
    id: '10000000-0000-4000-8000-000000000031' as ProfileId,
    status,
    sections: [{ heading: 'Summary', lines: ['Rowan, age 7.'] }],
  };
}

function approveIntake(visit: Visit, sensoryNotes: string): Visit {
  const answers = { ...visit.intake.answers, sensoryNotes };
  const profile = shown('draft');
  let next = reduceVisit(visit, { type: 'intake', event: { type: 'submit', answers } });
  next = reduceVisit(next, { type: 'intake', event: { type: 'draft', profile } });
  next = reduceVisit(next, { type: 'intake', event: { type: 'approve' } });
  return reduceVisit(next, {
    type: 'intake',
    event: { type: 'approved', profile: { ...profile, status: 'approved' } },
  });
}

test('the sample church and a closed brief are the initial visit', () => {
  const visit = initialVisit();
  assert.equal(visit.role, 'parent');
  assert.equal(visit.story.phase, 'idle');
  assert.equal(visit.brief.phase, 'open');
  assert.equal(visit.visibility.medical, false);
  assert.equal(visit.visibility.sensory, true);
  assert.equal(checkInBrief(visit).status, 'withheld');
  assert.deepEqual(visit.church, {
    name: 'Example Harbor Fellowship',
    service: 'Sunday 9:30',
    room: 'Harbor Room',
    leader: 'Devon Placeholder',
    ages: 'Ages 5\u201312',
    plan: 'A short welcome, one song, and a quiet activity.',
  });
});

test('a brief stays withheld until approval, then keeps the snapshot', () => {
  let visit = initialVisit();
  visit = reduceVisit(visit, {
    type: 'saveCard',
    card: { ...visit.card, medical: 'TICK-MEDICAL' },
  });
  assert.equal(checkInBrief(visit).status, 'withheld');
  assert.equal(reduceVisit(visit, { type: 'approveBrief' }), visit);

  visit = approveIntake(visit, 'TICK-QUIET-ROOM');
  assert.equal(visit.card.loves, '');
  assert.equal(visit.card.medical, 'TICK-MEDICAL');
  assert.equal(checkInBrief(visit).status, 'withheld');

  const fresh = approveIntake(initialVisit(), 'TICK-QUIET-ROOM');
  assert.equal(fresh.cardTouched, false);
  assert.equal(fresh.card.loves, 'Soft music and helping with snack cups.');
  assert.equal(fresh.card.overwhelms, 'Surprise loud songs.');
  assert.equal(fresh.card.whatHelps, 'A warning before music.');
  assert.equal(fresh.card.communication, 'A short warning before a change.');
  assert.equal(fresh.card.sensory, 'TICK-QUIET-ROOM');
  assert.equal(fresh.card.medical, '');
  assert.equal(checkInBrief(fresh).status, 'withheld');

  visit = reduceVisit(fresh, {
    type: 'saveCard',
    card: { ...fresh.card, medical: 'TICK-MEDICAL', communication: '   ' },
  });
  assert.equal(checkInBrief(visit).status, 'withheld');

  visit = reduceVisit(visit, { type: 'approveBrief' });
  const hiddenMedical = checkInBrief(visit);
  assert.equal(hiddenMedical.status, 'approved');
  if (hiddenMedical.status !== 'approved') return;
  assert.equal(
    hiddenMedical.lines.some((line) => line.field === 'medical'),
    false,
  );
  assert.equal(
    hiddenMedical.lines.some((line) => line.field === 'communication'),
    false,
  );
  const sensory = hiddenMedical.lines.find((line) => line.field === 'sensory');
  assert.equal(sensory?.label, 'Sensory needs');
  assert.equal(sensory?.text, 'TICK-QUIET-ROOM');
  assert.equal(
    hiddenMedical.lines.some((line) => line.text === 'Soft music and helping with snack cups.'),
    true,
  );

  const sneaky: Visit = {
    ...visit,
    card: { ...visit.card, medical: 'TICK-MEDICAL-LIVE' },
    visibility: { ...visit.visibility, medical: true },
  };
  assert.deepEqual(checkInBrief(sneaky), hiddenMedical);

  visit = reduceVisit(visit, { type: 'saveNotes', notes: 'TICK-AFTER-SUNDAY' });
  visit = reduceVisit(visit, { type: 'setLesson', source: 'TICK-LESSON-PLAN' });
  visit = reduceVisit(visit, {
    type: 'saveChurch',
    church: { ...visit.church, room: 'Other room' },
  });
  assert.deepEqual(checkInBrief(visit), hiddenMedical);

  visit = reduceVisit(visit, { type: 'visibility', field: 'medical', on: true });
  assert.equal(checkInBrief(visit).status, 'withheld');
  assert.equal(visit.story.phase, 'idle');
  visit = reduceVisit(visit, { type: 'approveBrief' });
  const shownMedical = checkInBrief(visit);
  assert.equal(shownMedical.status, 'approved');
  if (shownMedical.status !== 'approved') return;
  assert.deepEqual(
    shownMedical.lines.find((line) => line.field === 'medical'),
    { field: 'medical', label: 'Medical / health notes', text: 'TICK-MEDICAL' },
  );

  visit = reduceVisit(visit, { type: 'writeStory' });
  visit = reduceVisit(visit, {
    type: 'storyReady',
    value: { title: 'Sunday with Rowan', body: 'TICK-QUIET-ROOM' },
  });
  visit = reduceVisit(visit, { type: 'approveStory' });
  assert.equal(visit.story.phase, 'approved');

  const edited: ProfileCard = { ...visit.card, loves: 'Quiet blocks.' };
  visit = reduceVisit(visit, { type: 'saveCard', card: edited });
  assert.equal(checkInBrief(visit).status, 'withheld');
  assert.equal(visit.story.phase, 'idle');
  assert.equal(visit.notes, 'TICK-AFTER-SUNDAY');
});

test('lesson and Sunday update stop when the draft is ready', () => {
  let visit = approveIntake(initialVisit(), 'TICK-QUIET-ROOM');
  assert.equal(reduceVisit(visit, { type: 'approveStory' }).story.phase, 'idle');
  visit = reduceVisit(visit, { type: 'writeUpdate' });
  visit = reduceVisit(visit, { type: 'updateReady', value: { body: 'Rowan waved.' } });
  assert.equal(visit.update.phase, 'ready');
  if (visit.update.phase !== 'ready') return;
  assert.equal(visit.update.value.body, 'Rowan waved.');

  visit = reduceVisit(visit, { type: 'writeLesson', source: 'A short lesson.' });
  visit = reduceVisit(visit, {
    type: 'lessonReady',
    value: { summary: 'A short lesson.', steps: ['A short lesson.'] },
  });
  assert.equal(visit.lesson.phase, 'ready');
  const idle = initialVisit();
  assert.equal(reduceVisit(idle, { type: 'storyFailed', message: 'nope' }), idle);
  assert.equal(reduceVisit(idle, { type: 'lessonFailed', message: 'nope' }), idle);
  assert.equal(reduceVisit(idle, { type: 'updateFailed', message: 'nope' }), idle);
});
