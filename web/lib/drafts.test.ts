import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SUNDAY_STORY_PAGE_MAX, templateStoryPages } from '../../src/sunday-story-text.ts';
import { postSocialStory } from './drafts.ts';

const harbor = {
  name: 'Example Harbor Fellowship',
  service: 'Sunday 9:00',
  room: 'Harbor Room',
  leader: 'Ms. Dana',
  plan: 'A short welcome, one song, and a quiet activity.',
};

test('the browser accepts a story page longer than 1200 characters', async () => {
  const stem = 'Rowan can hold a Disney story and wait by the doorway near softer lights';
  const beat = ' and a quiet hello';
  let body = stem;
  while ((body + beat).length + 1 <= 1500) body += beat;
  const quiet = `${body}.`;
  assert.equal(quiet.length > 1200 && quiet.length <= SUNDAY_STORY_PAGE_MAX, true);
  const pages = { ...templateStoryPages(harbor), quiet };
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ title: 'Sunday with Rowan', pages, source: 'model' });
  try {
    const result = await postSocialStory(
      [{ field: 'sensory', label: 'Sensory needs', text: 'Softer lights and a Disney story.' }],
      'Rowan',
      harbor,
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.pages.quiet, quiet);
    assert.equal(result.value.source, 'model');
  } finally {
    globalThis.fetch = original;
  }
});
