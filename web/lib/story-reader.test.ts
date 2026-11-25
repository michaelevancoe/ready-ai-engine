import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initialReader, reduceReader } from './story-reader.ts';
import { checkInBrief, initialVisit, reduceVisit } from './visit.ts';

const story = {
  title: 'Sunday with Maya',
  body: 'Maya arrives and finds a quiet place.\n\nA warning comes before the next song.',
};

test('a saved story opens on the title and a failed request can be tried again', () => {
  assert.equal(initialReader().phase, 'closed');
  const writing = reduceReader(initialReader(), { type: 'open', saved: null });
  assert.equal(writing.phase, 'writing');
  const failed = reduceReader(writing, { type: 'fail' });
  assert.equal(failed.phase, 'failed');
  assert.equal(reduceReader(failed, { type: 'retry' }).phase, 'writing');
  const shown = reduceReader(writing, { type: 'loaded', value: story });
  assert.equal(shown.phase, 'shown');
  if (shown.phase !== 'shown') return;
  assert.equal(shown.title, 'Sunday with Maya');
  assert.deepEqual(shown.paragraphs, [
    'Maya arrives and finds a quiet place.',
    'A warning comes before the next song.',
  ]);
  assert.equal(reduceReader(shown, { type: 'back' }).phase, 'closed');
  assert.equal(reduceReader(writing, { type: 'back' }).phase, 'closed');
  assert.deepEqual(reduceReader(initialReader(), { type: 'open', saved: story }), shown);
  assert.equal(reduceReader({ phase: 'closed' }, { type: 'fail' }).phase, 'closed');
  assert.equal(reduceReader({ phase: 'closed' }, { type: 'loaded', value: story }).phase, 'closed');
});

test('noteStory stores prose for an approved example and leaves the brief lines alone', () => {
  const idle = initialVisit();
  assert.equal(reduceVisit(idle, { type: 'noteStory', value: story }), idle);
  const example = reduceVisit(idle, { type: 'conversation', event: { type: 'openExample', id: 'maya' } });
  assert.equal(reduceVisit(example, { type: 'writeStory' }), example);
  const noted = reduceVisit(example, { type: 'noteStory', value: story });
  assert.equal(noted.story.phase, 'ready');
  if (noted.story.phase !== 'ready') return;
  assert.deepEqual(noted.story.value, story);
  assert.deepEqual(checkInBrief(noted), checkInBrief(example));
  const again = reduceVisit(noted, {
    type: 'noteStory',
    value: { title: 'Sunday with Maya', body: 'One quiet room.' },
  });
  assert.equal(again.story.phase, 'ready');
  if (again.story.phase !== 'ready') return;
  assert.equal(again.story.value.body, 'One quiet room.');
  assert.deepEqual(checkInBrief(again), checkInBrief(example));
});
