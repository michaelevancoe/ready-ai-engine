import assert from 'node:assert/strict';
import { test } from 'node:test';
import { storyBodyAccepted, stripBracketPlaceholders, updateBodyAccepted } from '../src/demo-drafts.ts';

const labels =
  'Loves. Overwhelms. What helps. Communication. Sensory needs. Medical / health notes.';

test('storyBodyAccepted rejects a dict and a body that is only the labels', () => {
  assert.equal(storyBodyAccepted("{ 'loves': 'Soft music' }"), false);
  assert.equal(storyBodyAccepted(labels), false);
  assert.equal(storyBodyAccepted('The room has "sensory": quiet corners.'), false);
  assert.equal(storyBodyAccepted('["Loves"]'), false);
});

test('storyBodyAccepted accepts a short prose paragraph', () => {
  assert.equal(storyBodyAccepted('You arrive and the room is quiet. Soft music helps.'), true);
});

test('updateBodyAccepted rejects the notes and the notes plus only the child name', () => {
  const notes = 'TICK-AFTER-SUNDAY';
  const name = 'Juniper';
  assert.equal(updateBodyAccepted(notes, notes, name), false);
  assert.equal(updateBodyAccepted(`${notes}\n${name}`, notes, name), false);
  assert.equal(updateBodyAccepted(`${name} ${notes}`, notes, name), false);
  assert.equal(updateBodyAccepted(`${notes}   ${name}`, notes, name), false);
});

test('updateBodyAccepted accepts the model words around the notes', () => {
  const notes = 'TICK-AFTER-SUNDAY';
  const body = `Sunday went well. ${notes} The quiet seat helped.`;
  assert.equal(updateBodyAccepted(body, notes, 'Juniper'), true);
});

test('stripBracketPlaceholders removes a bracketed name and keeps the note', () => {
  const notes = 'TICK-AFTER-SUNDAY';
  const body = `Sunday went well. ${notes} The quiet seat helped.\n[Volunteer's Name]`;
  assert.equal(
    stripBracketPlaceholders(body),
    `Sunday went well. ${notes} The quiet seat helped.`,
  );
  assert.equal(stripBracketPlaceholders('Hello [Name].'), 'Hello.');
  assert.equal(stripBracketPlaceholders('[Name]'), '');
  assert.equal(stripBracketPlaceholders('Thanks, [Volunteer’s Name].'), 'Thanks.');
});

test('updateBodyAccepted rejects an empty body left by a placeholder', () => {
  assert.equal(updateBodyAccepted('', 'TICK-AFTER-SUNDAY', 'Juniper'), false);
});
