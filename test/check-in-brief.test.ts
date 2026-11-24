import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ProfileId, ShownProfile } from '../web/lib/desk.ts';
import {
  approvedValue,
  checkInBrief,
  initialVisit,
  readyValue,
  reduceVisit,
  reviewValue,
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

function approveIntake(visit: Visit, lines: TreeLines = {}): Visit {
  const helps = lines.helps ?? 'A warning before music.';
  let next = say(visit, lines.about ?? 'He likes a quiet hello.');
  next = say(next, lines.loves ?? 'Quiet blocks.');
  next = say(next, lines.overwhelms ?? 'Surprise loud songs.');
  next = say(next, helps);
  if (helps.trim().length <= 40) next = sayOrSkip(next, lines.helpsMore);
  next = say(next, lines.communication ?? 'Picture cards.');
  next = say(next, lines.sensory ?? 'TICK-QUIET-ROOM');
  if (lines.medical === undefined) {
    next = reduceVisit(next, { type: 'conversation', event: { type: 'declineMedical' } });
  } else {
    next = reduceVisit(next, { type: 'conversation', event: { type: 'acceptMedical' } });
    next = say(next, lines.medical);
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

interface TreeLines {
  readonly about?: string;
  readonly loves?: string;
  readonly overwhelms?: string;
  readonly helps?: string;
  readonly helpsMore?: string;
  readonly communication?: string;
  readonly sensory?: string;
  readonly medical?: string;
}

function say(visit: Visit, text: string): Visit {
  return reduceVisit(visit, { type: 'conversation', event: { type: 'answer', text } });
}

function sayOrSkip(visit: Visit, text: string | undefined): Visit {
  if (text === undefined) return reduceVisit(visit, { type: 'conversation', event: { type: 'skip' } });
  return say(visit, text);
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

  visit = approveIntake(visit);
  assert.equal(visit.card.loves, '');
  assert.equal(visit.card.medical, 'TICK-MEDICAL');
  assert.equal(checkInBrief(visit).status, 'withheld');

  const fresh = approveIntake(initialVisit());
  assert.equal(fresh.cardTouched, false);
  assert.equal(fresh.card.loves, 'Quiet blocks.');
  assert.equal(fresh.card.overwhelms, 'Surprise loud songs.');
  assert.equal(fresh.card.whatHelps, 'A warning before music.');
  assert.equal(fresh.card.communication, 'Picture cards.');
  assert.equal(fresh.card.sensory, 'TICK-QUIET-ROOM');
  assert.equal(fresh.card.medical, '');
  assert.equal(fresh.visibility.medical, false);
  const opted = approveIntake(initialVisit(), { medical: 'TICK-MEDICAL-NOTE' });
  assert.equal(opted.card.medical, 'TICK-MEDICAL-NOTE');
  assert.equal(opted.visibility.medical, false);
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
    hiddenMedical.lines.some((line) => line.text === 'A warning before music.'),
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
  let visit = approveIntake(initialVisit());
  assert.equal(reduceVisit(visit, { type: 'approveStory' }).story.phase, 'idle');
  visit = reduceVisit(visit, { type: 'saveNotes', notes: 'TICK-AFTER-SUNDAY' });
  assert.equal(reduceVisit(visit, { type: 'writeUpdate' }), visit);

  const leader = reduceVisit(initialVisit(), { type: 'role', role: 'leader' });
  assert.equal(reduceVisit(leader, { type: 'writeUpdate' }), leader);
  const blank = reduceVisit(leader, { type: 'saveNotes', notes: '   ' });
  assert.equal(reduceVisit(blank, { type: 'writeUpdate' }), blank);
  const volunteer = reduceVisit(leader, { type: 'role', role: 'volunteer' });
  const withNotes = reduceVisit(volunteer, { type: 'saveNotes', notes: 'TICK-AFTER-SUNDAY' });
  assert.equal(reduceVisit(withNotes, { type: 'writeUpdate' }), withNotes);

  visit = reduceVisit(visit, { type: 'role', role: 'leader' });
  visit = reduceVisit(visit, { type: 'writeUpdate' });
  assert.equal(visit.update.phase, 'writing');
  assert.equal(reduceVisit(visit, { type: 'writeUpdate' }), visit);
  visit = reduceVisit(visit, { type: 'updateReady', value: { body: 'Rowan waved.' } });
  assert.equal(visit.update.phase, 'ready');
  if (visit.update.phase !== 'ready') return;
  assert.equal(visit.update.value.body, 'Rowan waved.');
  assert.equal(approvedValue(visit.update), null);
  assert.equal(reviewValue(visit.update)?.body, 'Rowan waved.');
  assert.equal(readyValue({ phase: 'idle' }), null);
  assert.equal(readyValue({ phase: 'ready', value: { body: 'Rowan waved.' } })?.body, 'Rowan waved.');

  visit = reduceVisit(visit, { type: 'writeLesson', source: 'A short lesson.' });
  visit = reduceVisit(visit, {
    type: 'lessonReady',
    value: { summary: 'A short lesson.', steps: ['A short lesson.'] },
  });
  assert.equal(visit.lesson.phase, 'ready');
  assert.equal(approvedValue(visit.lesson), null);
  assert.equal(reviewValue(visit.lesson)?.summary, 'A short lesson.');
  const idle = initialVisit();
  assert.equal(reduceVisit(idle, { type: 'storyFailed', message: 'nope' }), idle);
  assert.equal(reduceVisit(idle, { type: 'lessonFailed', message: 'nope' }), idle);
  assert.equal(reduceVisit(idle, { type: 'updateFailed', message: 'nope' }), idle);
});

test('a leader approves the edited parent note and the lesson', () => {
  let visit = reduceVisit(initialVisit(), { type: 'role', role: 'leader' });
  visit = reduceVisit(visit, { type: 'saveNotes', notes: 'TICK-AFTER-SUNDAY' });
  assert.equal(reduceVisit(visit, { type: 'approveUpdate', body: 'Hello' }), visit);
  assert.equal(reduceVisit(visit, { type: 'approveLesson' }), visit);

  visit = reduceVisit(visit, { type: 'writeUpdate' });
  visit = reduceVisit(visit, { type: 'updateReady', value: { body: 'Draft line.' } });
  const parent = reduceVisit(visit, { type: 'role', role: 'parent' });
  assert.equal(reduceVisit(parent, { type: 'approveUpdate', body: 'Hello there.' }), parent);
  assert.equal(reduceVisit(parent, { type: 'approveLesson' }), parent);
  const volunteer = reduceVisit(visit, { type: 'role', role: 'volunteer' });
  const copied = reduceVisit(volunteer, {
    type: 'approveUpdate',
    body: '  Sunday went well. TICK-AFTER-SUNDAY  ',
  });
  assert.equal(copied, volunteer);
  assert.equal(reduceVisit(visit, { type: 'approveUpdate', body: '   ' }), visit);

  visit = reduceVisit(visit, {
    type: 'approveUpdate',
    body: '  Sunday went well. TICK-AFTER-SUNDAY  ',
  });
  assert.equal(approvedValue(visit.update)?.body, 'Sunday went well. TICK-AFTER-SUNDAY');
  assert.equal(reduceVisit(visit, { type: 'approveUpdate', body: 'Again' }), visit);

  visit = reduceVisit(visit, { type: 'writeLesson', source: 'A short lesson.' });
  visit = reduceVisit(visit, {
    type: 'lessonReady',
    value: { summary: 'A short lesson.', steps: ['One step.'] },
  });
  const parentLesson = reduceVisit(visit, { type: 'role', role: 'parent' });
  assert.equal(reduceVisit(parentLesson, { type: 'approveLesson' }).lesson.phase, 'ready');
  visit = reduceVisit(visit, { type: 'approveLesson' });
  assert.equal(visit.lesson.phase, 'approved');
  assert.equal(approvedValue(visit.lesson)?.steps[0], 'One step.');
  assert.equal(reduceVisit(visit, { type: 'approveLesson' }), visit);
});

test('withdrawing the brief clears an approved lesson and keeps the parent note', () => {
  let visit = approveIntake(initialVisit());
  visit = reduceVisit(visit, { type: 'approveBrief' });
  visit = reduceVisit(visit, { type: 'role', role: 'leader' });
  visit = reduceVisit(visit, { type: 'saveNotes', notes: 'TICK-AFTER-SUNDAY' });
  visit = reduceVisit(visit, { type: 'writeUpdate' });
  visit = reduceVisit(visit, { type: 'updateReady', value: { body: 'Sunday went well for Rowan.' } });
  visit = reduceVisit(visit, { type: 'approveUpdate', body: 'Sunday went well for Rowan.\nTheo Park' });
  visit = reduceVisit(visit, { type: 'writeLesson', source: 'TICK-LESSON-PLAN' });
  visit = reduceVisit(visit, {
    type: 'lessonReady',
    value: { summary: 'Plan for Rowan', steps: ['TICK-LESSON-PLAN'] },
  });
  visit = reduceVisit(visit, { type: 'approveLesson' });
  assert.equal(visit.lesson.phase, 'approved');

  visit = reduceVisit(visit, { type: 'saveCard', card: { ...visit.card, sensory: 'A quieter room.' } });
  assert.equal(checkInBrief(visit).status, 'withheld');
  assert.equal(visit.lesson.phase, 'idle');
  assert.equal(visit.lessonSource, 'TICK-LESSON-PLAN');
  assert.equal(approvedValue(visit.update)?.body, 'Sunday went well for Rowan.\nTheo Park');
});

test('withdrawing the brief clears the lesson and keeps the typed lesson', () => {
  let visit = approveIntake(initialVisit());
  visit = reduceVisit(visit, { type: 'approveBrief' });
  visit = reduceVisit(visit, { type: 'writeLesson', source: 'TICK-LESSON-PLAN' });
  visit = reduceVisit(visit, {
    type: 'lessonReady',
    value: { summary: 'Plan for Rowan', steps: ['TICK-LESSON-PLAN', 'TICK-MEDICAL'] },
  });
  visit = reduceVisit(visit, { type: 'visibility', field: 'medical', on: true });
  assert.equal(checkInBrief(visit).status, 'withheld');
  assert.equal(visit.lesson.phase, 'idle');
  assert.equal(visit.lessonSource, 'TICK-LESSON-PLAN');

  visit = reduceVisit(visit, { type: 'approveBrief' });
  visit = reduceVisit(visit, { type: 'writeLesson', source: 'TICK-LESSON-PLAN' });
  visit = reduceVisit(visit, {
    type: 'lessonReady',
    value: { summary: 'Plan for Rowan', steps: ['TICK-LESSON-PLAN'] },
  });
  visit = reduceVisit(visit, {
    type: 'saveCard',
    card: { ...visit.card, sensory: 'A quieter room.' },
  });
  assert.equal(checkInBrief(visit).status, 'withheld');
  assert.equal(visit.lesson.phase, 'idle');
  assert.equal(visit.lessonSource, 'TICK-LESSON-PLAN');
});

test('a new answer drops a stale draft', () => {
  let visit = say(initialVisit(), 'He likes a quiet hello.');
  visit = say(visit, 'Quiet blocks.');
  visit = say(visit, 'Surprise loud songs.');
  visit = say(visit, 'A warning before music.');
  visit = reduceVisit(visit, { type: 'conversation', event: { type: 'skip' } });
  visit = say(visit, 'Picture cards.');
  visit = say(visit, 'TICK-QUIET-ROOM');
  visit = reduceVisit(visit, { type: 'conversation', event: { type: 'declineMedical' } });
  const profile = shown('draft');
  visit = reduceVisit(visit, { type: 'intake', event: { type: 'submit', nonce: 1 } });
  visit = reduceVisit(visit, { type: 'intake', event: { type: 'draft', profile, nonce: 1 } });
  assert.equal(visit.intake.status, 'draft');
  visit = reduceVisit(visit, {
    type: 'conversation',
    event: { type: 'fix', sectionId: 'sensory', reason: 'Quieter.' },
  });
  assert.equal(visit.intake.status, 'draft');
  visit = say(visit, 'TICK-SOFTER-SEAT');
  assert.equal(visit.intake.status, 'idle');
  assert.equal(reduceVisit(visit, { type: 'intake', event: { type: 'approve' } }), visit);
  assert.equal(visit.conversation.answers.loves?.kind, 'answered');
});

test('going back while a draft is in flight drops that attempt', () => {
  let visit = say(initialVisit(), 'He likes a quiet hello.');
  visit = say(visit, 'Quiet blocks.');
  visit = say(visit, 'Surprise loud songs.');
  visit = say(visit, 'A warning before music.');
  visit = reduceVisit(visit, { type: 'conversation', event: { type: 'skip' } });
  visit = say(visit, 'Picture cards.');
  visit = say(visit, 'Bright lights.');
  visit = reduceVisit(visit, { type: 'conversation', event: { type: 'declineMedical' } });
  const profile = shown('draft');
  visit = reduceVisit(visit, { type: 'intake', event: { type: 'submit', nonce: 1 } });
  assert.equal(visit.intake.status, 'submitting');
  visit = reduceVisit(visit, { type: 'conversation', event: { type: 'reopen' } });
  assert.equal(visit.intake.status, 'idle');
  visit = say(visit, 'TICK-SOFTER-SEAT');
  assert.equal(visit.conversation.talk.mode, 'reviewWait');
  const late = reduceVisit(visit, { type: 'intake', event: { type: 'draft', profile, nonce: 1 } });
  assert.equal(late.intake.status, 'idle');
  assert.equal(late.conversation.answers.sensory?.kind, 'answered');
  if (late.conversation.answers.sensory?.kind !== 'answered') return;
  assert.equal(late.conversation.answers.sensory.text, 'TICK-SOFTER-SEAT');
});

test('seeded intake lines gain a space between glued sentences', () => {
  const visit = approveIntake(initialVisit(), {
    overwhelms: 'Sudden loud noises.Surprise loud songs.',
    helps: 'corner.A warning',
  });
  assert.equal(visit.card.overwhelms, 'Sudden loud noises. Surprise loud songs.');
  assert.equal(visit.card.whatHelps, 'corner. A warning');
});

test('saveCard replaces seeded overwhelms and the brief keeps the new line', () => {
  let visit = approveIntake(initialVisit());
  visit = reduceVisit(visit, {
    type: 'saveCard',
    card: { ...visit.card, overwhelms: 'Sudden loud noises.' },
  });
  assert.equal(visit.card.overwhelms, 'Sudden loud noises.');
  visit = reduceVisit(visit, { type: 'approveBrief' });
  const brief = checkInBrief(visit);
  assert.equal(brief.status, 'approved');
  if (brief.status !== 'approved') return;
  assert.equal(brief.lines.find((line) => line.field === 'overwhelms')?.text, 'Sudden loud noises.');
});
