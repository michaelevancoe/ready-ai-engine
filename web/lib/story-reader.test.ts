import assert from 'node:assert/strict';
import { test } from 'node:test';
import { STORY_BEATS, type StoryPages } from '../../src/sunday-story-text.ts';
import { initialReader, reduceReader } from './story-reader.ts';
import { checkInBrief, initialVisit, reduceVisit, type SocialStory } from './visit.ts';

const pages: StoryPages = {
  arrive: 'Maya arrives and finds a quiet place.',
  doors: 'A warning comes before the next song.',
  desk: 'Maya waits by the desk.',
  room: 'Maya finds the room.',
  helper: 'A helper waves at Maya.',
  quiet: 'The corner stays quiet for Maya.',
  pickup: 'Maya goes home with a grown-up.',
};

const story: SocialStory = {
  title: 'Sunday with Maya',
  pages,
  source: 'model',
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
  assert.equal(shown.source, 'model');
  assert.equal(shown.title, 'Sunday with Maya');
  assert.deepEqual(
    shown.paragraphs,
    STORY_BEATS.map((beat) => pages[beat]),
  );
  assert.equal(reduceReader(shown, { type: 'back' }).phase, 'closed');
  assert.equal(reduceReader(writing, { type: 'back' }).phase, 'closed');
  assert.deepEqual(reduceReader(initialReader(), { type: 'open', saved: story }), shown);
  assert.equal(reduceReader({ phase: 'closed' }, { type: 'fail' }).phase, 'closed');
  assert.equal(reduceReader({ phase: 'closed' }, { type: 'loaded', value: story }).phase, 'closed');
});

test('noteStory stores pages for an approved example and leaves the brief lines alone', () => {
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
    value: { title: 'Sunday with Maya', pages: sameLine('One quiet room.'), source: 'model' },
  });
  assert.equal(again.story.phase, 'ready');
  if (again.story.phase !== 'ready') return;
  assert.equal(again.story.value.pages.arrive, 'One quiet room.');
  assert.deepEqual(checkInBrief(again), checkInBrief(example));
});

test('a fallback story stays source fallback on the shown reader', () => {
  const writing = reduceReader(initialReader(), { type: 'open', saved: null });
  const shown = reduceReader(writing, {
    type: 'loaded',
    value: {
      title: 'Sunday with Maya',
      pages: sameLine('Maya arrives and finds a quiet place.'),
      source: 'fallback',
    },
  });
  assert.equal(shown.phase, 'shown');
  if (shown.phase !== 'shown') return;
  assert.equal(shown.source, 'fallback');
  assert.deepEqual(
    shown.paragraphs,
    STORY_BEATS.map(() => 'Maya arrives and finds a quiet place.'),
  );
});

function sameLine(line: string): StoryPages {
  return {
    arrive: line,
    doors: line,
    desk: line,
    room: line,
    helper: line,
    quiet: line,
    pickup: line,
  };
}
