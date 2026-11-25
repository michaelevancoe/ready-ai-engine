import assert from 'node:assert/strict';
import { test } from 'node:test';
import { acknowledgementLine } from './acknowledgement.ts';

test('a timeout, an error, or a blank line uses the fallback', () => {
  assert.equal(acknowledgementLine({ kind: 'timeout' }), "That's really helpful.");
  assert.equal(acknowledgementLine({ kind: 'error' }), "That's really helpful.");
  assert.equal(acknowledgementLine({ kind: 'line', text: '   ' }), "That's really helpful.");
  assert.equal(acknowledgementLine({ kind: 'line', text: 'Thanks for telling me.' }), 'Thanks for telling me.');
});
