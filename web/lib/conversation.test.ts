import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  initialConversation,
  joinSpoken,
  parentBrief,
  presentAsk,
  project,
  reduceConversation,
  type Conversation,
} from './conversation.ts';
import { intakeTree } from './intake-tree.ts';
import { listen, type Recognition, type RecognitionEvent } from './speech.ts';

const LONG_HELPS = 'A quiet corner and a heads-up before the next song.';
const BEHAVIOR =
  'When Rowan is very upset, does he ever hurt himself or others, or run off? If so, what helps in that moment?';
const HELPS_FOLLOW =
  'Thanks, that helps. Is there anything else that calms Rowan, like a quiet spot or a heads-up before changes?';
const ABOUT = 'To start: how would you describe Rowan in a sentence or two?';

test('the first question is the tree prompt and the walk is nine sections', () => {
  const conversation = begin();
  const view = presentAsk(intakeTree, conversation);
  assert.equal(view.kind, 'question');
  if (view.kind !== 'question') return;
  assert.equal(view.prompt, ABOUT);
  assert.equal(view.prompt, intakeTree.nodes.find((node) => node.id === 'about')?.prompt);
  assert.equal(view.prompt.includes("That's really helpful."), false);
  assert.equal(view.progress, 'Section 1 of 9 · About Rowan');
  assert.equal(view.mark, 'About Rowan · REQUIRED');
  const next = say(conversation, 'He likes a quiet hello.');
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
  assert.equal(promptOf(followed), 'How does Rowan usually let you know what he needs?');
  assert.equal(LONG_HELPS.length > 40, true);
  const long = say(atHelps(), LONG_HELPS);
  assert.equal(promptOf(long), 'How does Rowan usually let you know what he needs?');
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
  assert.equal(promptOf(open), 'What happens, and what should a volunteer do?');
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
  assert.equal(view.prompt, node?.prompt);
  assert.equal(view.prompt, BEHAVIOR);
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
  const conversation = say(begin(), 'He likes a quiet hello');
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
  assert.equal(projected.card.allergies, 'No known allergies.');
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
  assert.equal(maya.cards.every((card) => card.updated === false), true);
  assert.equal(reduceConversation(intakeTree, opened, { type: 'chooseSection', sectionId: 'communication' }), opened);
  const approved = reduceConversation(intakeTree, opened, { type: 'approve' });
  const view = presentAsk(intakeTree, approved);
  assert.equal(view.kind, 'approved');
  if (view.kind !== 'approved') return;
  assert.equal(view.headline, 'Maya is ready for Sunday');
  const again = reduceConversation(intakeTree, approved, { type: 'viewBrief' });
  assert.equal(again.talk.mode, 'brief');
  assert.deepEqual(again.answers, {});
  const start = reduceConversation(intakeTree, approved, { type: 'leaveExample' });
  assert.equal(start.talk.mode, 'start');
  const jonah = parentBrief(
    intakeTree,
    reduceConversation(intakeTree, initialConversation(), { type: 'openExample', id: 'jonah' }),
  );
  assert.equal(jonah.name, 'Jonah');
  assert.equal(jonah.ageYears, 9);
  assert.equal(jonah.cards.find((card) => card.sectionId === 'communication')?.text.includes('picture cards'), true);
  const rowan = parentBrief(
    intakeTree,
    reduceConversation(intakeTree, initialConversation(), { type: 'openExample', id: 'rowan' }),
  );
  assert.equal(rowan.ageYears, 7);
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
  const typed = say(begin(), 'Trains at home.');
  const spoken = say(begin(), heard);
  assert.equal(heard, 'Trains at home.');
  assert.deepEqual(spoken.talk, typed.talk);
  assert.deepEqual(spoken.answers, typed.answers);
  assert.equal(promptOf(spoken), 'What does Rowan love, at church or at home?');
});

function begin(): Conversation {
  return reduceConversation(intakeTree, initialConversation(), { type: 'beginIntake' });
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
  return say(say(say(begin(), 'He likes a quiet hello.'), 'Trains.'), 'Crowded doorways.');
}

function atToileting(): Conversation {
  return say(say(say(atHelps(), LONG_HELPS), 'Picture cards.'), 'Bright lights.');
}

function atAllergies(): Conversation {
  return say(atToileting(), 'Tells an adult');
}

function finish(conversation: Conversation): Conversation {
  const script: Record<string, string> = {
    about: 'He likes a quiet hello.',
    loves: 'Trains.',
    overwhelms: 'Crowded doorways.',
    helps: LONG_HELPS,
    'helps-more': 'A quiet corner',
    communication: 'Picture cards.',
    sensory: 'Bright lights.',
    toileting: 'Tells an adult',
    allergies: 'No known allergies',
    'allergies-more': 'Use the pen and call the leader.',
    behavior: 'No, not usually',
  };
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
