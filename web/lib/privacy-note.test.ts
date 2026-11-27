import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  parentReviewPrivacy,
  parentStartPrivacy,
  storyPrivacy,
  volunteerCheckInPrivacy,
} from './privacy-note.ts';

const churchName = 'Example Harbor Fellowship';
const leader = 'Ms. Dana';
const room = 'Harbor Room';
const name = 'Rowan';

test('privacy notes use the default church, leader, room, and child', () => {
  assert.deepEqual(parentStartPrivacy(churchName), {
    title: 'Before you start: who sees what you share',
    bullets: [
      "Only your child's kids-ministry leader and this Sunday's volunteers at Example Harbor Fellowship see the brief.",
      'Nothing is shared until you approve it.',
      "Care notes you write go to your child's leaders exactly as you wrote them.",
      'The story your child reads stays simple and label-free.',
      'This demo uses made-up children. Nothing is saved to a database, and closing the tab clears it.',
    ],
  });
  assert.deepEqual(parentReviewPrivacy({ name, leader, churchName }), {
    title: "Who sees Rowan's brief",
    bullets: [
      "Ms. Dana and this Sunday's volunteers at Example Harbor Fellowship. No one else.",
      'Nothing is shared until you approve. You can fix anything first.',
      "Care notes you write, like allergies, go to Rowan's leaders exactly as you wrote them.",
      'The story Rowan reads stays simple and label-free. Medical details stay out.',
      'This demo uses made-up children. Nothing is saved to a database.',
    ],
  });
  assert.deepEqual(storyPrivacy({ name, room, source: 'model' }), {
    pill: 'Written by Ready · only from your approved answers',
    line: "Ready used only your approved answers and Harbor Room's plan. Medical details and labels stay out of Rowan's story.",
  });
  assert.deepEqual(storyPrivacy({ name, room, source: 'fallback' }), {
        pill: "Simple version · Ready's personal story wasn't available just now",
    line: "Ready kept this story simple today, using only Harbor Room's plan.",
  });
  assert.equal(
    volunteerCheckInPrivacy(name),
    "Shared by Rowan's parent for this Sunday's team only. Care notes are in the parent's own words.",
  );
});

test('a readonly review drops the until-you-approve bullet', () => {
  const note = parentReviewPrivacy({ name, leader, churchName, readonly: true });
  assert.equal(
    note.bullets.includes('Nothing is shared until you approve. You can fix anything first.'),
    false,
  );
  assert.equal(note.bullets.includes("Ms. Dana and this Sunday's volunteers at Example Harbor Fellowship. No one else."), true);
  const draft = parentReviewPrivacy({ name, leader, churchName });
  assert.equal(draft.bullets.includes('Nothing is shared until you approve. You can fix anything first.'), true);
});
