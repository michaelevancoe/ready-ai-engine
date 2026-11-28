import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sundayStoryPages } from './sunday-story.ts';
import { HARBOR_SCHEDULE } from './sunday-schedule.ts';
import { initialVisit } from './visit.ts';

test('Example Harbor Fellowship has a fixed Sunday schedule from 9:00 to 10:15', () => {
  assert.equal(HARBOR_SCHEDULE.place, 'Example Harbor Fellowship');
  assert.equal(HARBOR_SCHEDULE.span, '9:00 to 10:15');
  assert.deepEqual(
    HARBOR_SCHEDULE.items.map((item) => item.label),
    [
      'Arrive and check in at the Welcome Desk',
      'Harbor Room free play',
      'Song time',
      'Bible story',
      'Snack',
      'Quiet activity',
      'Pickup with family',
    ],
  );
  assert.equal(HARBOR_SCHEDULE.items[0]?.time, '9:00');
  assert.equal(HARBOR_SCHEDULE.items.at(-1)?.time, '10:15');
  assert.equal(new Set(HARBOR_SCHEDULE.items.map((item) => item.time)).size, HARBOR_SCHEDULE.items.length);
});

test('the Sunday story stays a cover plus seven pages', () => {
  const pages = sundayStoryPages(initialVisit());
  assert.equal(pages.length, 8);
  assert.equal(pages[4]?.step, 4);
  assert.equal(pages[4]?.slot, 'classroom');
});
