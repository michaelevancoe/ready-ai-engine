import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  answerNeedsAck,
  initialConversation,
  joinSpoken,
  parentBrief,
  presentAsk,
  project,
  reduceConversation,
  resumeConversation,
  type Conversation,
  type ExampleId,
} from './conversation.ts';
import { intakeTree } from './intake-tree.ts';
import { listen, type Recognition, type RecognitionEvent } from './speech.ts';
import { checkInBrief, initialVisit, reduceVisit } from './visit.ts';

const LONG_HELPS = 'A quiet corner and a heads-up before the next song.';
const BEHAVIOR =
  'When Rowan is very upset, does Rowan ever hurt himself or others, or run off? If so, what helps in that moment?';
const HELPS_FOLLOW =
  'One more about what helps: is there anything else that calms Rowan, like a quiet spot or a heads-up before changes?';
const ABOUT = 'To start: how would you describe Rowan in a sentence or two?';
const COMMUNICATION = 'How does Rowan usually let you know what Rowan needs?';
const NAME_NOTICE = 'Use 1 to 40 letters, spaces, hyphens, or apostrophes.';
const AGE_NOTICE = 'Use a whole number from 0 to 18.';

test('the first questions are the name and the age, then nine sections', () => {
  const conversation = begin();
  const view = presentAsk(intakeTree, conversation);
  assert.equal(view.kind, 'question');
  if (view.kind !== 'question') return;
  assert.equal(view.nodeId, 'name');
  assert.equal(view.prompt, 'What name does your child go by at church?');
  assert.equal(view.notice, null);
  assert.equal(view.progress, 'Section 1 of 9 · About your child');
  assert.equal(view.mark, 'About your child · REQUIRED');
  const aged = say(conversation, 'Rowan');
  assert.equal(promptOf(aged), 'How old is Rowan?');
  const described = say(aged, '7');
  assert.equal(promptOf(described), ABOUT);
  const next = say(described, 'He likes a quiet hello.');
  assert.equal(promptOf(next), 'What does Rowan love, at church or at home?');
  const loved = presentAsk(intakeTree, next);
  assert.equal(loved.kind, 'question');
  if (loved.kind !== 'question') return;
  assert.equal(loved.progress, 'Section 2 of 9 · Loves');
});

test('a short What helps answer opens the follow-up and a long answer does not', () => {
  const short = say(atHelps(), 'Headphones.');
  assert.equal(promptOf(short), HELPS_FOLLOW);
  const followed = say(short, 'A quiet corner');
  assert.equal(promptOf(followed), COMMUNICATION);
  assert.equal(LONG_HELPS.length > 40, true);
  const long = say(atHelps(), LONG_HELPS);
  assert.equal(promptOf(long), COMMUNICATION);
  assert.equal(long.answers['helps-more'], undefined);
});

test('a longer replacement drops the earlier follow-up', () => {
  const followed = say(say(atHelps(), 'Headphones.'), 'A quiet corner');
  const fixing = choose(finish(followed), 'helps');
  const replaced = say(fixing, LONG_HELPS);
  assert.equal(replaced.talk.mode, 'brief');
  assert.equal(replaced.answers['helps-more'], undefined);
  assert.equal(project(intakeTree, replaced).post.whatHelps, LONG_HELPS);
});

test('a blank answer stays on the question', () => {
  const ready = atHelps();
  const blank = say(ready, '   ');
  assert.equal(blank, ready);
});

test('re-entering helps exposes the stored follow-up answer', () => {
  const followed = say(say(atHelps(), 'Headphones.'), 'A quiet corner');
  const fixing = choose(finish(followed), 'helps');
  const view = presentAsk(intakeTree, fixing);
  assert.equal(view.kind, 'question');
  if (view.kind !== 'question') return;
  assert.equal(view.prompt, 'What helps Rowan feel calm again when things get to be too much?');
  assert.equal(view.notice, null);
  assert.equal(view.priorAnswer, 'Headphones.');
  assert.equal(view.followAnswer, 'A quiet corner');
  const shorter = say(fixing, 'Snack.');
  assert.equal(shorter.talk.mode, 'fix');
  if (shorter.talk.mode !== 'fix') return;
  assert.equal(shorter.talk.nodeId, 'helps-more');
  assert.deepEqual(shorter.answers['helps-more'], { kind: 'answered', text: 'A quiet corner' });
});

test('no known allergies closes the follow-up and any other allergy answer opens it', () => {
  const open = say(atAllergies(), 'Peanuts');
  assert.equal(open.talk.mode, 'ask');
  if (open.talk.mode !== 'ask') return;
  assert.equal(open.talk.nodeId, 'allergies-more');
  assert.equal(
    promptOf(open),
    'One more about allergies and health: what happens for Rowan, and what should a volunteer do?',
  );
  const closed = say(atAllergies(), 'No known allergies');
  assert.equal(closed.answers['allergies-more'], undefined);
  assert.equal(promptOf(closed), BEHAVIOR);
  const stored = say(open, 'Use the pen and call the leader.');
  const cleared = say(choose(say(stored, 'No, not usually'), 'allergies'), 'No known allergies');
  assert.equal(cleared.answers['allergies-more'], undefined);
  assert.equal(cleared.talk.mode, 'brief');
});

test('the behavior question is the tree prompt', () => {
  const conversation = say(atAllergies(), 'No known allergies');
  const node = intakeTree.nodes.find((item) => item.id === 'behavior');
  const view = presentAsk(intakeTree, conversation);
  assert.equal(view.kind, 'question');
  if (view.kind !== 'question') return;
  assert.equal(view.prompt, BEHAVIOR);
  assert.equal(node?.prompt.includes('Rowan'), false);
  assert.equal(view.progress, 'Section 9 of 9 · Behavior & safety');
  assert.equal(view.mark, 'Behavior & safety · REQUIRED');
  const toileting = atToileting();
  const toiletingView = presentAsk(intakeTree, toileting);
  assert.equal(toiletingView.kind, 'question');
  if (toiletingView.kind !== 'question') return;
  assert.equal(toiletingView.progress, 'Section 7 of 9 · Toileting');
});

test('fixing communication returns to the brief and marks that card', () => {
  const finished = finish(begin());
  const sensory = finished.answers.sensory;
  const fixing = choose(finished, 'communication');
  assert.equal(fixing.talk.mode, 'fix');
  if (fixing.talk.mode !== 'fix') return;
  assert.equal(fixing.talk.sectionId, 'communication');
  assert.equal(fixing.talk.nodeId, 'communication');
  const asking = presentAsk(intakeTree, fixing);
  assert.equal(asking.kind, 'question');
  if (asking.kind !== 'question') return;
  assert.equal(asking.mark, 'Communication · FIX');
  const saved = say(fixing, 'Picture cards and a nod.');
  assert.equal(saved.talk.mode, 'brief');
  if (saved.talk.mode !== 'brief') return;
  assert.equal(saved.talk.source.type, 'intake');
  assert.deepEqual(saved.updated, ['communication']);
  assert.deepEqual(saved.answers.communication, { kind: 'answered', text: 'Picture cards and a nod.' });
  assert.equal(saved.answers.sensory, sensory);
  const brief = parentBrief(intakeTree, saved);
  assert.equal(brief.cards.find((card) => card.sectionId === 'communication')?.updated, true);
  assert.equal(brief.cards.find((card) => card.sectionId === 'communication')?.text, 'Picture cards and a nod.');
  assert.equal(brief.cards.find((card) => card.sectionId === 'sensory')?.updated, false);
  assert.equal(brief.cards.find((card) => card.sectionId === 'behavior')?.label, 'Safety & calming');
});

test('back to questions keeps every answer and opens the first question', () => {
  const finished = finish(begin());
  const answers = finished.answers;
  const reopened = reduceConversation(intakeTree, finished, { type: 'reopenQuestions' });
  assert.equal(reopened.talk.mode, 'ask');
  if (reopened.talk.mode !== 'ask') return;
  assert.equal(reopened.talk.nodeId, 'name');
  assert.equal(reopened.answers, answers);
  assert.equal(reopened.answers.loves?.text, 'Trains.');
  const view = presentAsk(intakeTree, reopened);
  assert.equal(view.kind, 'question');
  if (view.kind !== 'question') return;
  assert.equal(view.priorAnswer, 'Rowan');
  assert.equal(reduceConversation(intakeTree, reopened, { type: 'approve' }), reopened);
});

test('joinSpoken puts a full stop between a typed answer and a chip', () => {
  assert.equal(joinSpoken('Soft voice', 'A quiet corner'), 'Soft voice. A quiet corner.');
  assert.equal(joinSpoken('Soft voice.', 'A quiet corner'), 'Soft voice. A quiet corner.');
  assert.equal(joinSpoken('Soft voice!', 'A quiet corner'), 'Soft voice! A quiet corner.');
  assert.equal(joinSpoken('Soft voice?', 'A quiet corner'), 'Soft voice? A quiet corner.');
  assert.equal(joinSpoken('', 'A quiet corner'), 'A quiet corner.');
  assert.equal(joinSpoken('', 'Already done.'), 'Already done.');
  assert.equal(joinSpoken('Soft voice', 'A quiet corner.'), 'Soft voice. A quiet corner.');
});

test('a joined primary answer ends with a full stop', () => {
  const conversation = say(named(), 'He likes a quiet hello');
  assert.equal(parentBrief(intakeTree, conversation).summary, 'He likes a quiet hello.');
  assert.equal(project(intakeTree, conversation).post.supportNeeds, 'He likes a quiet hello.');
});

test('project keeps the six intake keys and leaves medical empty', () => {
  const projected = project(intakeTree, finish(begin()));
  assert.equal(projected.post.preferredName, 'Rowan');
  assert.equal(projected.post.ageYears, 7);
  assert.deepEqual(Object.keys(projected.post).sort(), [
    'ageYears',
    'preferredName',
    'sensoryNotes',
    'supportNeeds',
    'whatHelps',
    'whatToAvoid',
  ]);
  assert.equal(projected.card.medical, '');
  assert.equal(projected.card.loves, 'Trains.');
  assert.equal(projected.card.toileting, 'Tells an adult.');
  assert.equal(projected.card.allergies, 'Food allergy. Use the pen and call the leader.');
  assert.equal(projected.card.calming, 'No, not usually.');
  assert.equal(projected.post.sensoryNotes.endsWith('.'), true);
});

test('an example brief keeps the fixture name and does not store answers', () => {
  const opened = reduceConversation(intakeTree, initialConversation(), { type: 'openExample', id: 'maya' });
  assert.equal(opened.talk.mode, 'approved');
  assert.deepEqual(opened.answers, {});
  assert.deepEqual(opened.updated, []);
  const maya = parentBrief(intakeTree, opened);
  assert.equal(maya.name, 'Maya');
  assert.equal(maya.ageYears, 5);
  assert.equal(maya.cards.find((card) => card.sectionId === 'allergies')?.text.includes('peanut'), true);
  assert.equal([...maya.photos, ...maya.cards.map((card) => card.text)].join(' ').includes('His'), false);
  assert.deepEqual(maya.photos, ['Maya', 'Her dinosaurs', 'A dim corner']);
  assert.equal(maya.cards.every((card) => card.updated === false), true);
  assert.equal(reduceConversation(intakeTree, opened, { type: 'chooseSection', sectionId: 'communication' }), opened);
  const approved = reduceConversation(intakeTree, opened, { type: 'approve' });
  const view = presentAsk(intakeTree, approved);
  assert.equal(view.kind, 'approved');
  if (view.kind !== 'approved') return;
  assert.equal(view.headline, 'Maya is ready for Sunday');
  const again = reduceConversation(intakeTree, approved, { type: 'viewBrief' });
  assert.equal(again.talk.mode, 'brief');
  if (again.talk.mode !== 'brief') return;
  assert.equal(again.talk.review, 'approved');
  assert.deepEqual(again.answers, {});
  const againView = presentAsk(intakeTree, again);
  assert.equal(againView.kind, 'brief');
  if (againView.kind !== 'brief') return;
  assert.equal(againView.actions, 'readonly');
  const back = reduceConversation(intakeTree, again, { type: 'backToApproved' });
  const backView = presentAsk(intakeTree, back);
  assert.equal(backView.kind, 'approved');
  const start = reduceConversation(intakeTree, approved, { type: 'leaveExample' });
  assert.equal(start.talk.mode, 'start');
  const jonah = parentBrief(
    intakeTree,
    reduceConversation(intakeTree, initialConversation(), { type: 'openExample', id: 'jonah' }),
  );
  assert.equal(jonah.name, 'Jonah');
  assert.equal(jonah.ageYears, 9);
  assert.equal(jonah.cards.find((card) => card.sectionId === 'communication')?.text.includes('picture cards'), true);
  assert.deepEqual(jonah.photos, ['Jonah', 'His Lego', 'Picture cards']);
  const rowan = parentBrief(
    intakeTree,
    reduceConversation(intakeTree, initialConversation(), { type: 'openExample', id: 'rowan' }),
  );
  assert.equal(rowan.ageYears, 7);
  assert.deepEqual(rowan.photos, ['Rowan', 'His headphones', 'Quiet corner']);
  assert.equal(rowan.summary.includes('Disney'), true);
  assert.equal(rowan.summary.includes('quiet breaks'), true);
});

test('a transcript from speech and a typed string advance the same node', () => {
  let heard = '';
  const fake = fakeRecognition();
  listen((text) => {
    heard = text;
  }, fake);
  fake.emit('Trains at home.');
  const start = named();
  const typed = say(start, 'Trains at home.');
  const spoken = say(start, heard);
  assert.equal(heard, 'Trains at home.');
  assert.deepEqual(spoken.talk, typed.talk);
  assert.deepEqual(spoken.answers, typed.answers);
  assert.equal(promptOf(spoken), 'What does Rowan love, at church or at home?');
});

test('saved answers resume on the next unanswered question', () => {
  const cursor = say(say(named(), 'He is quiet.'), 'Quiet trains');
  const resumed = resumeConversation(intakeTree, cursor.answers);
  assert.deepEqual(resumed.talk, cursor.talk);
  assert.equal(presentAsk(intakeTree, resumed).kind, 'question');
  assert.equal(resumed.answers.loves?.text, 'Quiet trains');
  assert.deepEqual(resumeConversation(intakeTree, {}), initialConversation());
});

test('Theo at age 8 is the brief, and name and age need no acknowledgement', () => {
  assert.equal(answerNeedsAck(intakeTree, 'name'), false);
  assert.equal(answerNeedsAck(intakeTree, 'age'), false);
  assert.equal(answerNeedsAck(intakeTree, 'helps'), true);
  const answered = say(say(begin(), 'Theo'), '8');
  const brief = parentBrief(intakeTree, answered);
  assert.equal(brief.name, 'Theo');
  assert.equal(brief.ageYears, 8);
  assert.equal(project(intakeTree, answered).post.preferredName, 'Theo');
  assert.equal(project(intakeTree, answered).post.ageYears, 8);
  const prompts = presentedPrompts(answered);
  assert.equal(prompts.length > 0, true);
  for (const prompt of prompts) {
    assert.equal(prompt.includes('Theo'), true, prompt);
    assert.equal(prompt.includes('Rowan'), false, prompt);
  }
  const finished = finish(named('Theo', '8'));
  assert.equal(finished.talk.mode, 'brief');
  if (finished.talk.mode !== 'brief') return;
  assert.equal(finished.talk.review, 'draft');
  const drafted = presentAsk(intakeTree, finished);
  assert.equal(drafted.kind, 'brief');
  if (drafted.kind !== 'brief') return;
  assert.equal(drafted.actions, 'draft');
  assert.deepEqual(drafted.brief.photos, ['Theo', 'Headphones', 'Quiet corner']);
  const approved = reduceConversation(intakeTree, finished, { type: 'approve' });
  const ready = presentAsk(intakeTree, approved);
  assert.equal(ready.kind, 'approved');
  if (ready.kind !== 'approved') return;
  assert.equal(ready.canRevise, true);
  assert.equal(ready.name, 'Theo');
});

test('a bad name or age stays on that question with a gentle notice', () => {
  for (const text of ['Theo!', '---', "'"]) {
    const badName = say(begin(), text);
    assert.equal(badName.talk.mode, 'ask');
    if (badName.talk.mode !== 'ask') return;
    assert.equal(badName.talk.nodeId, 'name', text);
    assert.equal(badName.talk.notice, NAME_NOTICE, text);
    assert.equal(badName.answers.name, undefined, text);
  }
  const badName = say(begin(), 'Theo!');
  const nameView = presentAsk(intakeTree, badName);
  assert.equal(nameView.kind, 'question');
  if (nameView.kind !== 'question') return;
  assert.equal(nameView.notice, NAME_NOTICE);
  const aged = say(begin(), 'Theo');
  for (const text of ['19', '8 years', '   ']) {
    const stayed = say(aged, text);
    assert.equal(stayed.talk.mode, 'ask');
    if (stayed.talk.mode !== 'ask') return;
    assert.equal(stayed.talk.nodeId, 'age', text);
    assert.equal(stayed.talk.notice, AGE_NOTICE, text);
    assert.equal(stayed.answers.age, undefined, text);
    const view = presentAsk(intakeTree, stayed);
    assert.equal(view.kind, 'question');
    if (view.kind !== 'question') return;
    assert.equal(view.notice, AGE_NOTICE, text);
  }
  const noticed = say(aged, '19');
  const next = say(noticed, '8');
  assert.equal(next.talk.mode, 'ask');
  if (next.talk.mode !== 'ask') return;
  assert.equal(next.talk.nodeId, 'about');
  assert.equal(next.talk.notice, undefined);
  const cleared = presentAsk(intakeTree, next);
  assert.equal(cleared.kind, 'question');
  if (cleared.kind !== 'question') return;
  assert.equal(cleared.notice, null);
});

test('each answer lands in its own card and the name stays out of the summary', () => {
  const tokens = {
    about: 'ABOUT-TOKEN',
    loves: 'LOVES-TOKEN',
    overwhelms: 'OVERWHELMS-TOKEN',
    helps: 'HELPS-TOKEN',
    helpsMore: 'HELPS-MORE-TOKEN',
    communication: 'COMM-TOKEN',
    sensory: 'SENSORY-TOKEN',
    toileting: 'TOILET-TOKEN',
    allergies: 'ALLERGY-TOKEN',
    allergiesMore: 'ALLERGY-MORE-TOKEN',
    behavior: 'CALM-TOKEN',
  };
  const finished = finish(named('Theo', '8'), {
    about: tokens.about,
    loves: tokens.loves,
    overwhelms: tokens.overwhelms,
    helps: tokens.helps,
    'helps-more': tokens.helpsMore,
    communication: tokens.communication,
    sensory: tokens.sensory,
    toileting: tokens.toileting,
    allergies: tokens.allergies,
    'allergies-more': tokens.allergiesMore,
    behavior: tokens.behavior,
  });
  const brief = parentBrief(intakeTree, finished);
  const projected = project(intakeTree, finished);
  assert.equal(brief.summary.includes(tokens.about), true);
  assert.equal(brief.summary.includes('Theo'), false);
  assert.equal(brief.summary.includes('8'), false);
  for (const token of Object.values(tokens)) {
    if (token === tokens.about) continue;
    assert.equal(brief.summary.includes(token), false, token);
  }
  const own: Record<string, readonly string[]> = {
    loves: [tokens.loves],
    overwhelms: [tokens.overwhelms],
    helps: [tokens.helps, tokens.helpsMore],
    communication: [tokens.communication],
    sensory: [tokens.sensory],
    toileting: [tokens.toileting],
    allergies: [tokens.allergies, tokens.allergiesMore],
    behavior: [tokens.behavior],
  };
  const cardText: Record<string, string> = {
    loves: projected.card.loves,
    overwhelms: projected.card.overwhelms,
    helps: projected.card.whatHelps,
    communication: projected.card.communication,
    sensory: projected.card.sensory,
    toileting: projected.card.toileting,
    allergies: projected.card.allergies,
    behavior: projected.card.calming,
  };
  for (const [sectionId, expected] of Object.entries(own)) {
    const review = brief.cards.find((card) => card.sectionId === sectionId)?.text ?? '';
    const field = cardText[sectionId] ?? '';
    assert.equal(review, field, sectionId);
    for (const token of expected) {
      assert.equal(review.includes(token), true, `${sectionId} ${token}`);
    }
    for (const [otherId, others] of Object.entries(own)) {
      if (otherId === sectionId) continue;
      for (const token of others) {
        assert.equal(review.includes(token), false, `${token} leaked into ${sectionId}`);
      }
    }
    assert.equal(review.includes('Theo'), false, sectionId);
    assert.equal(review.includes(tokens.about), false, sectionId);
  }
  assert.equal(projected.post.preferredName, 'Theo');
  assert.equal(projected.post.ageYears, 8);
  assert.equal(projected.card.medical, '');
});

test('a none phrase skips the allergy follow-up and a real allergy opens it', () => {
  for (const text of ['Nothing else.', 'none', 'No allergies', 'No known allergies']) {
    const closed = say(atAllergies(), text);
    assert.equal(closed.talk.mode, 'ask');
    if (closed.talk.mode !== 'ask') return;
    assert.equal(closed.talk.nodeId, 'behavior', text);
    assert.equal(closed.answers['allergies-more'], undefined, text);
  }
  for (const text of ['Food allergy', 'Peanut allergy']) {
    const open = say(atAllergies(), text);
    assert.equal(open.talk.mode, 'ask');
    if (open.talk.mode !== 'ask') return;
    assert.equal(open.talk.nodeId, 'allergies-more', text);
    const view = presentAsk(intakeTree, open);
    assert.equal(view.kind, 'question');
    if (view.kind !== 'question') return;
    assert.equal(view.mark.includes('ONE MORE'), true, view.mark);
    assert.equal(view.prompt.startsWith('One more about allergies and health:'), true, view.prompt);
  }
  const helps = say(atHelps(), 'Headphones.');
  const more = presentAsk(intakeTree, helps);
  assert.equal(more.kind, 'question');
  if (more.kind !== 'question') return;
  assert.equal(more.mark, 'WHAT HELPS · ONE MORE');
  assert.equal(more.prompt.startsWith('One more about what helps:'), true);
});

test('an example brief stays approved when it is viewed and closed', () => {
  const ids = ['rowan', 'maya', 'jonah'] as const satisfies readonly ExampleId[];
  for (const id of ids) {
    const opened = reduceConversation(intakeTree, initialConversation(), { type: 'openExample', id });
    const ready = presentAsk(intakeTree, opened);
    assert.equal(ready.kind, 'approved');
    if (ready.kind !== 'approved') return;
    assert.equal(ready.canRevise, false, id);
    const viewed = reduceConversation(intakeTree, opened, { type: 'viewBrief' });
    const brief = presentAsk(intakeTree, viewed);
    assert.equal(brief.kind, 'brief');
    if (brief.kind !== 'brief') return;
    assert.equal(brief.actions, 'readonly', id);
    const back = reduceConversation(intakeTree, viewed, { type: 'backToApproved' });
    const returned = presentAsk(intakeTree, back);
    assert.equal(returned.kind, 'approved', id);

    let visit = reduceVisit(initialVisit(), { type: 'conversation', event: { type: 'openExample', id } });
    assert.equal(checkInBrief(visit).status, 'approved', id);
    visit = reduceVisit(visit, { type: 'conversation', event: { type: 'viewBrief' } });
    assert.equal(checkInBrief(visit).status, 'approved', id);
    visit = reduceVisit(visit, { type: 'conversation', event: { type: 'backToApproved' } });
    assert.equal(visit.conversation.talk.mode, 'approved', id);
    assert.equal(checkInBrief(visit).status, 'approved', id);
  }
  const intake = reduceConversation(intakeTree, finish(begin()), { type: 'approve' });
  const approved = presentAsk(intakeTree, intake);
  assert.equal(approved.kind, 'approved');
  if (approved.kind !== 'approved') return;
  assert.equal(approved.canRevise, true);
});

function begin(): Conversation {
  return reduceConversation(intakeTree, initialConversation(), { type: 'beginIntake' });
}

function named(name = 'Rowan', age = '7'): Conversation {
  return say(say(begin(), name), age);
}

function say(conversation: Conversation, text: string): Conversation {
  return reduceConversation(intakeTree, conversation, { type: 'answer', text });
}

function choose(conversation: Conversation, sectionId: string): Conversation {
  return reduceConversation(intakeTree, conversation, { type: 'chooseSection', sectionId });
}

function promptOf(conversation: Conversation): string {
  const view = presentAsk(intakeTree, conversation);
  if (view.kind !== 'question') return '';
  return view.prompt;
}

function atHelps(): Conversation {
  return say(say(say(named(), 'He likes a quiet hello.'), 'Trains.'), 'Crowded doorways.');
}

function atToileting(): Conversation {
  return say(say(say(atHelps(), LONG_HELPS), 'Picture cards.'), 'Bright lights.');
}

function atAllergies(): Conversation {
  return say(atToileting(), 'Tells an adult');
}

function presentedPrompts(start: Conversation): string[] {
  const prompts: string[] = [];
  let current = start;
  while (current.talk.mode === 'ask') {
    prompts.push(promptOf(current));
    const text = finishScript()[current.talk.nodeId];
    if (text === undefined) break;
    const next = say(current, text);
    if (next === current) break;
    current = next;
  }
  return prompts;
}

function finishScript(): Record<string, string> {
  return {
    name: 'Rowan',
    age: '7',
    about: 'He likes a quiet hello.',
    loves: 'Trains.',
    overwhelms: 'Crowded doorways.',
    helps: 'Headphones.',
    'helps-more': 'A quiet corner',
    communication: 'Picture cards.',
    sensory: 'Bright lights.',
    toileting: 'Tells an adult',
    allergies: 'Food allergy',
    'allergies-more': 'Use the pen and call the leader.',
    behavior: 'No, not usually',
  };
}

function finish(conversation: Conversation, overrides: Record<string, string> = {}): Conversation {
  const script: Record<string, string> = { ...finishScript(), ...overrides };
  let current = conversation;
  while (current.talk.mode === 'ask') {
    const text = script[current.talk.nodeId];
    if (text === undefined) break;
    const next = say(current, text);
    if (next === current) break;
    current = next;
  }
  return current;
}

function fakeRecognition(): Recognition & { emit(text: string): void } {
  const recognition: Recognition & { emit(text: string): void } = {
    continuous: false,
    interimResults: false,
    lang: '',
    onresult: null,
    onerror: null,
    onend: null,
    start() {},
    stop() {},
    emit(text: string) {
      const event: RecognitionEvent = {
        resultIndex: 0,
        results: { length: 1, 0: { isFinal: true, length: 1, 0: { transcript: text } } },
      };
      recognition.onresult?.(event);
    },
  };
  return recognition;
}
