import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ProfileId, ShownProfile } from '../web/lib/desk.ts';
import { exampleBrief, type ExampleId } from '../web/lib/example-briefs.ts';
import {
  approvedValue,
  checkInBrief,
  childAgeYears,
  childPreferredName,
  exampleLines,
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

const HELPS = 'A warning before music, with a quiet seat nearby.';

function approveIntake(visit: Visit, lines: TreeLines = {}): Visit {
  let next = reduceVisit(visit, { type: 'conversation', event: { type: 'beginIntake' } });
  next = say(next, lines.name ?? 'Rowan');
  next = say(next, lines.age ?? '7');
  next = say(next, lines.about ?? 'He likes a quiet hello.');
  next = say(next, lines.loves ?? 'Quiet blocks.');
  next = say(next, lines.overwhelms ?? 'Surprise loud songs.');
  next = say(next, lines.helps ?? HELPS);
  next = answerIf(next, 'helps-more', lines.helpsMore ?? 'A quiet corner.');
  next = say(next, lines.communication ?? 'Picture cards.');
  next = say(next, lines.sensory ?? 'TICK-QUIET-ROOM');
  next = say(next, lines.toileting ?? 'Tells an adult');
  next = say(next, lines.allergies ?? 'No known allergies');
  next = answerIf(next, 'allergies-more', lines.allergiesMore ?? 'A volunteer avoids that food.');
  next = say(next, lines.behavior ?? 'No, not usually');
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
  readonly name?: string;
  readonly age?: string;
  readonly about?: string;
  readonly loves?: string;
  readonly overwhelms?: string;
  readonly helps?: string;
  readonly helpsMore?: string;
  readonly communication?: string;
  readonly sensory?: string;
  readonly toileting?: string;
  readonly allergies?: string;
  readonly allergiesMore?: string;
  readonly behavior?: string;
}

function say(visit: Visit, text: string): Visit {
  return reduceVisit(visit, { type: 'conversation', event: { type: 'answer', text } });
}

function answerIf(visit: Visit, nodeId: string, text: string): Visit {
  if (visit.conversation.talk.mode !== 'ask' || visit.conversation.talk.nodeId !== nodeId) return visit;
  return say(visit, text);
}

test('the sample church and a closed brief are the initial visit', () => {
  const visit = initialVisit();
  assert.equal(visit.role, 'parent');
  assert.equal(visit.conversation.talk.mode, 'start');
  assert.equal(visit.story.phase, 'idle');
  assert.equal(visit.brief.phase, 'open');
  assert.equal(visit.visibility.medical, false);
  assert.equal(visit.visibility.sensory, true);
  assert.equal(checkInBrief(visit).status, 'withheld');
  assert.deepEqual(visit.church, {
    name: 'Example Harbor Fellowship',
    service: 'Sunday 9:30',
    room: 'Harbor Room',
    leader: 'Ms. Dana',
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
  assert.equal(fresh.card.whatHelps, HELPS);
  assert.equal(fresh.card.communication, 'Picture cards.');
  assert.equal(fresh.card.sensory, 'TICK-QUIET-ROOM.');
  assert.equal(fresh.card.medical, '');
  assert.equal(fresh.visibility.medical, false);
  const allergic = approveIntake(initialVisit(), {
    allergies: 'Peanuts',
    allergiesMore: 'A volunteer avoids peanuts.',
  });
  assert.equal(allergic.card.medical, '');
  assert.equal(allergic.visibility.medical, false);
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
  assert.equal(hiddenMedical.lines.find((line) => line.field === 'communication')?.text, 'Picture cards.');
  const sensory = hiddenMedical.lines.find((line) => line.field === 'sensory');
  assert.equal(sensory?.label, 'Sensory needs');
  assert.equal(sensory?.text, 'TICK-QUIET-ROOM.');
  assert.equal(
    hiddenMedical.lines.some((line) => line.text === HELPS),
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
  assert.equal(
    shownMedical.lines.some((line) => line.field === 'medical'),
    false,
  );
  assert.equal(visit.card.medical, '');

  visit = reduceVisit(visit, { type: 'writeStory' });
  visit = reduceVisit(visit, {
    type: 'storyReady',
    value: { title: 'Sunday with Rowan', body: 'TICK-QUIET-ROOM', source: 'model' },
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

  let edited = reduceVisit(initialVisit(), { type: 'role', role: 'leader' });
  edited = reduceVisit(edited, { type: 'writeLesson', source: 'A short lesson.' });
  edited = reduceVisit(edited, {
    type: 'lessonReady',
    value: { summary: 'A short lesson.', steps: ['One step.'] },
  });
  edited = reduceVisit(edited, {
    type: 'approveLesson',
    value: { summary: 'Edited for Rowan.', steps: ['Sit quietly.', 'Sing one song.'] },
  });
  assert.equal(approvedValue(edited.lesson)?.summary, 'Edited for Rowan.');
  assert.deepEqual(approvedValue(edited.lesson)?.steps, ['Sit quietly.', 'Sing one song.']);
});

test('withdrawing the brief clears an approved lesson and keeps the parent note', () => {
  let visit = approveIntake(initialVisit());
  visit = reduceVisit(visit, { type: 'approveBrief' });
  visit = reduceVisit(visit, { type: 'role', role: 'leader' });
  visit = reduceVisit(visit, { type: 'saveNotes', notes: 'TICK-AFTER-SUNDAY' });
  visit = reduceVisit(visit, { type: 'writeUpdate' });
  visit = reduceVisit(visit, { type: 'updateReady', value: { body: 'Sunday went well for Rowan.' } });
  visit = reduceVisit(visit, { type: 'approveUpdate', body: 'Sunday went well for Rowan.\nJordan Ellis' });
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
  assert.equal(approvedValue(visit.update)?.body, 'Sunday went well for Rowan.\nJordan Ellis');
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

test('a correction keeps a draft', () => {
  let visit = reduceVisit(initialVisit(), { type: 'conversation', event: { type: 'beginIntake' } });
  visit = say(visit, 'Rowan');
  visit = say(visit, '7');
  visit = say(visit, 'He likes a quiet hello.');
  visit = say(visit, 'Quiet blocks.');
  visit = say(visit, 'Surprise loud songs.');
  visit = say(visit, HELPS);
  visit = say(visit, 'Picture cards.');
  visit = say(visit, 'TICK-QUIET-ROOM');
  visit = say(visit, 'Tells an adult');
  visit = say(visit, 'No known allergies');
  visit = say(visit, 'No, not usually');
  assert.equal(visit.conversation.talk.mode, 'brief');
  const profile = shown('draft');
  visit = reduceVisit(visit, { type: 'intake', event: { type: 'submit', nonce: 1 } });
  visit = reduceVisit(visit, { type: 'intake', event: { type: 'draft', profile, nonce: 1 } });
  assert.equal(visit.intake.status, 'draft');
  const sensory = visit.conversation.answers.sensory;
  visit = reduceVisit(visit, { type: 'conversation', event: { type: 'chooseSection', sectionId: 'communication' } });
  visit = say(visit, 'Picture cards and a nod.');
  assert.equal(visit.intake.status, 'draft');
  assert.equal(visit.conversation.talk.mode, 'brief');
  assert.deepEqual(visit.conversation.updated, ['communication']);
  assert.equal(visit.conversation.answers.sensory, sensory);
  assert.equal(reduceVisit(visit, { type: 'intake', event: { type: 'approve' } }).intake.status, 'approving');
});

test('seeded intake lines gain a space between glued sentences', () => {
  const visit = approveIntake(initialVisit(), {
    overwhelms: 'Sudden loud noises.Surprise loud songs.',
    helps: 'corner.A warning before the music starts in the room.',
  });
  assert.equal(visit.card.overwhelms, 'Sudden loud noises. Surprise loud songs.');
  assert.equal(visit.card.whatHelps, 'corner. A warning before the music starts in the room.');
});

test('approving again replaces the loves line from the new answer', () => {
  let visit = approveIntake(initialVisit(), { loves: 'Trains.' });
  visit = reduceVisit(visit, { type: 'approveBrief' });
  const first = checkInBrief(visit);
  assert.equal(first.status, 'approved');
  if (first.status !== 'approved') return;
  assert.equal(
    first.lines.some((line) => line.text.includes('Trains.')),
    true,
  );

  visit = reduceVisit(visit, { type: 'conversation', event: { type: 'chooseSection', sectionId: 'loves' } });
  visit = say(visit, 'Painted rocks');
  visit = reduceVisit(visit, { type: 'approveBrief' });
  const second = checkInBrief(visit);
  assert.equal(second.status, 'approved');
  if (second.status !== 'approved') return;
  const loves = second.lines.find((line) => line.field === 'loves')?.text ?? '';
  assert.equal(loves.includes('Painted rocks'), true);
  assert.equal(loves.includes('Trains.'), false);
  assert.equal(
    second.lines.some((line) => line.text.includes('Trains.')),
    false,
  );
});

test('noteStory ignores a story that is still being written', () => {
  let visit = approveIntake(initialVisit());
  visit = reduceVisit(visit, { type: 'approveBrief' });
  const lines = checkInBrief(visit);
  visit = reduceVisit(visit, { type: 'writeStory' });
  const writing = visit;
  assert.equal(writing.story.phase, 'writing');
  assert.equal(
    reduceVisit(writing, {
      type: 'noteStory',
      value: { title: 'Sunday with Rowan', body: 'A quiet room.', source: 'model' },
    }),
    writing,
  );
  visit = reduceVisit(writing, { type: 'storyFailed', message: 'The draft could not be written. Try again.' });
  visit = reduceVisit(visit, {
    type: 'noteStory',
    value: { title: 'Sunday with Rowan', body: 'A quiet room.', source: 'model' },
  });
  assert.equal(visit.story.phase, 'ready');
  assert.deepEqual(checkInBrief(visit), lines);
});

test('opening an example approves that child and leaving withdraws the brief', () => {
  const ids = ['rowan', 'maya', 'jonah'] as const satisfies readonly ExampleId[];
  for (const id of ids) {
    const visit = reduceVisit(initialVisit(), { type: 'conversation', event: { type: 'openExample', id } });
    assert.equal(visit.conversation.talk.mode, 'approved');
    assert.equal(visit.cardTouched, false);
    assert.equal(childPreferredName(visit), exampleBrief(id).name);
    assert.equal(childAgeYears(visit), exampleBrief(id).ageYears);
    const brief = checkInBrief(visit);
    assert.equal(brief.status, 'approved');
    if (brief.status !== 'approved') return;
    assert.deepEqual(brief.lines, exampleLines(id, visit.visibility));
    assert.equal(
      brief.lines.some((line) => line.field === 'medical'),
      false,
    );
    assert.equal(brief.lines.find((line) => line.field === 'whatHelps')?.label, 'What helps');
    assert.equal(brief.lines.find((line) => line.field === 'calming')?.label, 'Safety & calming');
    const again = reduceVisit(visit, { type: 'conversation', event: { type: 'viewBrief' } });
    const republished = reduceVisit(again, { type: 'conversation', event: { type: 'approve' } });
    assert.deepEqual(checkInBrief(republished), brief);
    const left = reduceVisit(republished, { type: 'conversation', event: { type: 'leaveExample' } });
    assert.equal(checkInBrief(left).status, 'withheld');
    assert.equal(left.card.loves, '');
    assert.equal(left.card.medical, '');
    assert.equal(left.cardTouched, false);
    assert.equal(left.story.phase, 'idle');
    assert.equal(left.lesson.phase, 'idle');
    assert.equal(childPreferredName(left), 'Rowan');
    assert.equal(childAgeYears(left), 7);
    assert.equal(reduceVisit(visit, { type: 'conversation', event: { type: 'openExample', id } }), visit);
  }

  const intake = reduceVisit(approveIntake(initialVisit()), { type: 'approveBrief' });
  const shown = checkInBrief(intake);
  assert.equal(shown.status, 'approved');
  if (shown.status !== 'approved') return;
  assert.equal(
    shown.lines.some((line) => line.field === 'medical'),
    false,
  );
  assert.equal(shown.lines.some((line) => line.text === HELPS), true);
});

test('approveBrief uses the conversation answer, not an edited card', () => {
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
  assert.equal(brief.lines.find((line) => line.field === 'overwhelms')?.text, 'Surprise loud songs.');
  assert.equal(visit.card.overwhelms, 'Surprise loud songs.');
});

test('a restored publication republishes an edited answer without a new intake', () => {
  const restored: Visit = {
    ...initialVisit(),
    brief: { phase: 'approved', lines: [{ field: 'loves', label: 'Loves', text: 'Trains' }] },
    conversation: {
      talk: { mode: 'approved', source: { type: 'intake' } },
      answers: {
        about: { kind: 'answered', text: 'He is quiet.' },
        loves: { kind: 'answered', text: 'Trains' },
      },
      updated: [],
    },
  };
  assert.equal(restored.intake.status, 'idle');
  let visit = reduceVisit(restored, { type: 'conversation', event: { type: 'reviseBrief' } });
  visit = reduceVisit(visit, { type: 'conversation', event: { type: 'chooseSection', sectionId: 'loves' } });
  visit = say(visit, 'Quiet trains');
  visit = reduceVisit(visit, { type: 'approveBrief' });
  const brief = checkInBrief(visit);
  assert.equal(brief.status, 'approved');
  if (brief.status !== 'approved') return;
  const loves = brief.lines.find((line) => line.field === 'loves')?.text ?? '';
  assert.equal(loves.includes('Quiet trains'), true);
  assert.equal(loves.includes('Trains'), false);
});
