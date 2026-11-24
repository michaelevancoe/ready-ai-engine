import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spaceSentences } from '../web/lib/desk.ts';

test('spaceSentences inserts one space after a sentence mark before a letter', () => {
  assert.equal(
    spaceSentences('Sudden loud noises.Surprise loud songs.'),
    'Sudden loud noises. Surprise loud songs.',
  );
  assert.equal(spaceSentences('corner.A warning'), 'corner. A warning');
});
