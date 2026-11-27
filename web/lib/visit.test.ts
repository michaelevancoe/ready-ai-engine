import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { pendingApprovalCopy } from './approve-copy.ts';
import type { StoryPages } from '../../src/sunday-story-text.ts';
import { checkInBrief, initialVisit, reduceVisit, volunteerRoster, type Visit } from './visit.ts';

test('a saved room change clears the story and an ages-only save does not', () => {
  let visit: Visit = {
    ...initialVisit(),
    brief: { phase: 'approved', lines: [] },
  };
  visit = reduceVisit(visit, {
    type: 'noteStory',
    value: { title: 'Sunday with Rowan', pages: sameLine('The Harbor Room is quiet.'), source: 'model' },
  });
  assert.equal(visit.story.phase, 'ready');

  const same = reduceVisit(visit, { type: 'saveChurch', church: visit.church });
  assert.equal(same.story.phase, 'ready');
  assert.equal(same.church.room, visit.church.room);

  const ages = reduceVisit(visit, {
    type: 'saveChurch',
    church: { ...visit.church, ages: 'Ages 4\u20138' },
  });
  assert.equal(ages.story.phase, 'ready');
  assert.equal(ages.church.ages, 'Ages 4\u20138');
  assert.equal(ages.church.room, visit.church.room);

  const room = reduceVisit(visit, {
    type: 'saveChurch',
    church: { ...visit.church, room: 'Cove Room' },
  });
  assert.deepEqual(room.story, { phase: 'idle' });
  assert.equal(room.church.room, 'Cove Room');
  assert.equal(checkInBrief(room).status, 'approved');
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

test('pending approval copy names the leader and the child', () => {
  const copy = pendingApprovalCopy('Ms. Dana', 'Rowan');
  assert.equal(copy.button, 'Sharing with Ms. Dana\u2026');
  assert.equal(copy.status, "Sharing Rowan's brief with Ms. Dana. This takes a few seconds.");
});

test('the live child has one roster row', () => {
  const source = readFileSync(new URL('../app/volunteer/page.tsx', import.meta.url), 'utf8');
  assert.equal(source.includes('Quinn'), false);
  assert.equal(source.includes('Sampleton'), false);
  assert.deepEqual(volunteerRoster(initialVisit()), [{ heading: 'Rowan, 7', status: 'No brief yet' }]);
  const ready = volunteerRoster({
    ...initialVisit(),
    brief: { phase: 'approved', lines: [] },
  });
  assert.deepEqual(ready, [{ heading: 'Rowan, 7', status: 'Brief ready' }]);
  assert.equal(ready.length, 1);
});
