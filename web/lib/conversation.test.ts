import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  initialConversation,
  presentAsk,
  project,
  reduceConversation,
  type Conversation,
} from './conversation.ts';
import { intakeTree } from './intake-tree.ts';
import { listen, type Recognition, type RecognitionEvent } from './speech.ts';

const LONG_HELPS = 'A quiet corner and a heads-up before the next song.';

test('branching advances to the next prompt', () => {
  let conversation = reduceConversation(intakeTree, initialConversation(), { type: 'start' });
  assert.equal(readyText(conversation), 'To start: how would you describe Rowan in a sentence or two?');
  const view = presentAsk(intakeTree, conversation);
  assert.equal(view.kind, 'question');
  if (view.kind !== 'question') return;
  assert.equal(view.progress, 'Section 1 of 6 · About Rowan');
  assert.equal(view.lines[0]?.text, "Hi Avery, I'm Ready. I'll ask a few short questions about Rowan, one at a time.");
  conversation = say(conversation, 'He likes a quiet hello.');
  assert.equal(readyText(conversation), acknowledged('What does Rowan love, at church or at home?'));
  conversation = say(conversation, 'Trains.');
  assert.equal(readyText(conversation), acknowledged('What tends to overwhelm Rowan at church or in new places?'));
});

test('a short What helps answer opens the follow-up and a long answer does not', () => {
  const short = say(atHelps(), 'Headphones.');
  assert.equal(readyText(short), HELPS_FOLLOW);
  const followed = say(short, 'A quiet corner');
  assert.equal(readyText(followed), acknowledged('How does Rowan communicate when words are hard?'));
  assert.equal(LONG_HELPS.length > 40, true);
  const long = say(atHelps(), LONG_HELPS);
  assert.equal(readyText(long), acknowledged('How does Rowan communicate when words are hard?'));
  assert.equal(long.answers['helps-more'], undefined);
});

test('a longer replacement drops the earlier follow-up', () => {
  const followed = say(say(atHelps(), 'Headphones.'), 'A quiet corner');
  const fixing = fixSection(followed, 'helps', 'More detail.');
  const replaced = say(fixing, LONG_HELPS);
  assert.equal(replaced.answers['helps-more'], undefined);
  assert.equal(project(intakeTree, replaced).post.whatHelps, LONG_HELPS);
  const skipped = reduceConversation(intakeTree, fixSection(followed, 'helps', 'Skip it.'), { type: 'skip' });
  assert.equal(skipped.answers['helps-more'], undefined);
  assert.equal(project(intakeTree, skipped).post.whatHelps, '');
});

test('a blank answer stays on the question', () => {
  const ready = atHelps();
  const blank = say(ready, '   ');
  assert.equal(blank, ready);
  const followed = say(say(ready, 'Headphones.'), 'A quiet corner');
  const fixing = fixSection(followed, 'helps', 'More detail.');
  const wiped = say(fixing, ' ');
  assert.equal(wiped, fixing);
  assert.equal(project(intakeTree, wiped).post.whatHelps, 'Headphones. A quiet corner.');
});

test('a second short answer keeps the earlier follow-up when nothing new is added', () => {
  const followed = say(say(atHelps(), 'Headphones.'), 'A quiet corner');
  const fixing = fixSection(followed, 'helps', 'Shorter.');
  const shorter = say(fixing, 'Snack.');
  const view = presentAsk(intakeTree, shorter);
  assert.equal(view.kind, 'question');
  if (view.kind !== 'question') return;
  assert.equal(
    view.lines.some((line) => line.from === 'parent' && line.text === 'A quiet corner'),
    true,
  );
  const kept = reduceConversation(intakeTree, shorter, { type: 'skip' });
  assert.equal(project(intakeTree, kept).post.whatHelps, 'Snack. A quiet corner.');
  assert.equal(kept.answers.loves, followed.answers.loves);
  const first = say(atHelps(), 'Headphones.');
  const cleared = reduceConversation(intakeTree, first, { type: 'skip' });
  assert.equal(project(intakeTree, cleared).post.whatHelps, 'Headphones.');
});

test('going back does not ask medical again after it was decided', () => {
  const asking = reduceConversation(intakeTree, atOffer(), { type: 'acceptMedical' });
  const shared = say(asking, 'Carries an inhaler.');
  const back = reduceConversation(intakeTree, shared, { type: 'reopen' });
  const resent = say(back, 'Softer seat.');
  assert.equal(resent.talk.mode, 'reviewWait');
  assert.equal(project(intakeTree, resent).card.medical, 'Carries an inhaler.');
  assert.equal(project(intakeTree, resent).card.sensory, 'Softer seat.');
});

test('skip does not open the follow-up', () => {
  const skipped = reduceConversation(intakeTree, atHelps(), { type: 'skip' });
  assert.equal(readyText(skipped), acknowledged('How does Rowan communicate when words are hard?'));
  assert.deepEqual(skipped.answers.helps, { kind: 'skipped' });
  assert.equal(skipped.answers['helps-more'], undefined);
});

test('decline leaves medical empty and accept stores it off the post', () => {
  const offer = presentAsk(intakeTree, atOffer());
  assert.equal(offer.kind, 'offer');
  if (offer.kind !== 'offer') return;
  assert.equal(offer.lines.some((line) => line.text === intakeTree.medicalOffer.lead), true);
  assert.equal(offer.lines.at(-1)?.text, intakeTree.medicalOffer.prompt);
  assert.equal(offer.skipLabel, 'Skip for now');
  assert.equal(offer.acceptLabel, 'Yes, add medical info');
  const declined = reduceConversation(intakeTree, atOffer(), { type: 'declineMedical' });
  assert.equal(declined.talk.mode, 'reviewWait');
  assert.equal(declined.medical, 'declined');
  const hidden = project(intakeTree, declined);
  assert.equal(hidden.card.medical, '');
  assert.equal(hidden.rows.find((row) => row.sectionId === 'medical')?.state, 'skipped');

  const asking = reduceConversation(intakeTree, atOffer(), { type: 'acceptMedical' });
  assert.equal(asking.medical, 'open');
  assert.equal(readyText(asking), "What medical or health note should stay with Rowan's profile?");
  const answered = say(asking, 'Carries an inhaler.');
  assert.equal(answered.talk.mode, 'reviewWait');
  const shown = project(intakeTree, answered);
  assert.equal(shown.card.medical, 'Carries an inhaler.');
  assert.equal(shown.rows.find((row) => row.sectionId === 'medical')?.state, 'drafted');
  assert.deepEqual(Object.keys(shown.post).sort(), [
    'ageYears',
    'preferredName',
    'sensoryNotes',
    'supportNeeds',
    'whatHelps',
    'whatToAvoid',
  ]);
});

test('project builds the six-key post from the answers', () => {
  const declined = reduceConversation(intakeTree, atOffer(), { type: 'declineMedical' });
  const projected = project(intakeTree, declined);
  assert.equal(projected.post.preferredName, 'Rowan');
  assert.equal(projected.post.ageYears, 7);
  assert.equal(projected.post.sensoryNotes, 'Bright lights. Sudden sound.');
  assert.equal(projected.post.supportNeeds, 'He likes a quiet hello. He uses picture cards.');
  assert.equal(projected.post.whatToAvoid, 'Crowded doorways.');
  assert.equal(projected.card.communication, 'He uses picture cards.');
  assert.equal(projected.card.sensory, 'Bright lights. Sudden sound.');
  assert.equal(projected.card.loves, 'Trains.');
  assert.notEqual(projected.post.supportNeeds, projected.card.communication);
});

test('fix returns to that section and a blank reason does not', () => {
  const waiting = reduceConversation(intakeTree, atOffer(), { type: 'declineMedical' });
  const picking = reduceConversation(intakeTree, waiting, { type: 'beginFix' });
  const pick = presentAsk(intakeTree, picking);
  assert.equal(pick.kind, 'fixPick');
  if (pick.kind !== 'fixPick') return;
  assert.equal(pick.lines[0]?.text, intakeTree.fixCopy.pick);
  assert.equal(pick.leave, "Rowan's profile");
  assert.equal(
    pick.chips.some((chip) => chip.id === 'helps' && chip.label === 'What helps'),
    true,
  );
  const chosen = reduceConversation(intakeTree, picking, { type: 'chooseSection', sectionId: 'helps' });
  const reason = presentAsk(intakeTree, chosen);
  assert.equal(reason.kind, 'fixReason');
  if (reason.kind !== 'fixReason') return;
  assert.equal(reason.lines.at(-1)?.text, intakeTree.fixCopy.reason);
  assert.equal(reason.leave, "Rowan's profile");
  const blank = reduceConversation(intakeTree, chosen, { type: 'giveReason', text: '   ' });
  assert.equal(blank, chosen);
  const fixing = reduceConversation(intakeTree, chosen, { type: 'giveReason', text: ' Add a snack. ' });
  assert.equal(fixing.talk.mode, 'fixing');
  if (fixing.talk.mode !== 'fixing') return;
  assert.equal(fixing.talk.done, false);
  assert.equal(fixing.talk.reason, 'Add a snack.');
  const fixingView = presentAsk(intakeTree, fixing);
  assert.equal(fixingView.kind, 'question');
  if (fixingView.kind !== 'question') return;
  assert.equal(fixingView.leave, "Rowan's profile");
  assert.equal(readyText(fixing), 'When Rowan starts to feel overwhelmed, what helps most?');
  assert.equal(fixing.answers.loves, waiting.answers.loves);
  assert.equal(fixing.answers.sensory, waiting.answers.sensory);
  const replaced = say(fixing, 'Headphones.');
  assert.equal(readyText(replaced), HELPS_FOLLOW);
  assert.equal(replaced.answers.sensory, waiting.answers.sensory);
  const done = say(replaced, "That's everything");
  assert.equal(done.talk.mode, 'fixing');
  if (done.talk.mode !== 'fixing') return;
  assert.equal(done.talk.done, true);
  const back = reduceConversation(intakeTree, done, { type: 'finishFix' });
  assert.equal(back.talk.mode, 'reviewWait');
  assert.equal(back.answers.sensory, waiting.answers.sensory);
  const reopened = reduceConversation(intakeTree, back, { type: 'reopen' });
  assert.equal(reopened.talk.mode, 'ask');
  if (reopened.talk.mode !== 'ask') return;
  assert.equal(reopened.talk.nodeId, 'sensory');
  assert.equal(reopened.answers, back.answers);
  assert.equal(project(intakeTree, back).post.whatHelps, "Headphones. That's everything.");
});

test('a transcript from speech and a typed string advance the same node', () => {
  let heard = '';
  const fake = fakeRecognition();
  listen((text) => {
    heard = text;
  }, fake);
  fake.emit('Trains at home.');
  const typed = say(reduceConversation(intakeTree, initialConversation(), { type: 'start' }), 'Trains at home.');
  const spoken = say(reduceConversation(intakeTree, initialConversation(), { type: 'start' }), heard);
  assert.equal(heard, 'Trains at home.');
  assert.deepEqual(spoken.talk, typed.talk);
  assert.deepEqual(spoken.answers, typed.answers);
  assert.equal(readyText(spoken), acknowledged('What does Rowan love, at church or at home?'));
});

const HELPS_FOLLOW =
  'Thanks, that helps. Is there anything else that calms Rowan, like a quiet spot or a heads-up before changes?';

function acknowledged(prompt: string): string {
  return `${intakeTree.acknowledgement} ${prompt}`;
}

function atReview(conversation: Conversation): Conversation {
  let current = conversation;
  while (current.talk.mode === 'ask' || current.talk.mode === 'intro') {
    const next = reduceConversation(intakeTree, current, { type: 'skip' });
    if (next === current) break;
    current = next;
  }
  if (current.talk.mode === 'medicalOffer') {
    return reduceConversation(intakeTree, current, { type: 'declineMedical' });
  }
  return current;
}

function fixSection(conversation: Conversation, sectionId: string, reason: string): Conversation {
  const waiting = conversation.talk.mode === 'reviewWait' ? conversation : atReview(conversation);
  const picking = reduceConversation(intakeTree, waiting, { type: 'beginFix' });
  const chosen = reduceConversation(intakeTree, picking, { type: 'chooseSection', sectionId });
  return reduceConversation(intakeTree, chosen, { type: 'giveReason', text: reason });
}

function say(conversation: Conversation, text: string): Conversation {
  return reduceConversation(intakeTree, conversation, { type: 'answer', text });
}

function readyText(conversation: Conversation): string {
  const view = presentAsk(intakeTree, conversation);
  if (view.kind === 'review') return '';
  const ready = view.lines.filter((line) => line.from === 'ready');
  return ready[ready.length - 1]?.text ?? '';
}

function atHelps(): Conversation {
  let conversation = reduceConversation(intakeTree, initialConversation(), { type: 'start' });
  conversation = say(conversation, 'He likes a quiet hello.');
  conversation = say(conversation, 'Trains.');
  return say(conversation, 'Crowded doorways.');
}

function atOffer(): Conversation {
  let conversation = say(atHelps(), LONG_HELPS);
  conversation = say(conversation, 'He uses picture cards.');
  return say(conversation, 'Bright lights.Sudden sound.');
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
