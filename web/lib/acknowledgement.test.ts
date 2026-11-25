import assert from 'node:assert/strict';
import { test } from 'node:test';
import { acknowledgementLine, decideAck } from './acknowledgement.ts';

const irrelevant = {
  kind: 'line' as const,
  relevant: false,
  line: 'Thanks. That helps.',
  clarifyingPrompt: 'What usually helps?',
};

test('a timeout, an error, or a blank line uses the fallback', () => {
  assert.equal(acknowledgementLine({ kind: 'timeout' }), "That's really helpful.");
  assert.equal(acknowledgementLine({ kind: 'error' }), "That's really helpful.");
  assert.equal(
    acknowledgementLine({ kind: 'line', relevant: true, line: '   ', clarifyingPrompt: '' }),
    "That's really helpful.",
  );
  assert.equal(
    acknowledgementLine({
      kind: 'line',
      relevant: true,
      line: 'Thanks for telling me.',
      clarifyingPrompt: '',
    }),
    'Thanks for telling me.',
  );
});

test('the first irrelevant answer is asked again and the next one is kept', () => {
  assert.deepEqual(decideAck(0, irrelevant), { action: 'reask', prompt: 'What usually helps?' });
  assert.deepEqual(decideAck(1, irrelevant), { action: 'accept', line: 'Thanks. That helps.' });
  assert.deepEqual(decideAck(2, irrelevant), { action: 'accept', line: 'Thanks. That helps.' });
  assert.deepEqual(decideAck(0, { kind: 'timeout' }), {
    action: 'accept',
    line: "That's really helpful.",
  });
  assert.deepEqual(decideAck(0, { kind: 'error' }), {
    action: 'accept',
    line: "That's really helpful.",
  });
  assert.deepEqual(
    decideAck(0, { kind: 'line', relevant: true, line: 'Thanks. That helps.', clarifyingPrompt: 'Again?' }),
    { action: 'accept', line: 'Thanks. That helps.' },
  );
});
