import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readWorkerBindings } from '../web/lib/worker-bindings.ts';

test('worker binding reader keeps strings and drops anything else', () => {
  const bindings = readWorkerBindings({
    READY_DEMO_MODEL: 'mock',
    READY_SIGN_IN: 'on',
    READY_MODE: 4,
    AI_GATEWAY_TOKEN: 'dummy-gateway-token-not-real',
    AI_GATEWAY_ACCOUNT_ID: 'dummy-account-not-real',
    AI_GATEWAY_BASE_URL: 12,
    OTHER: 'ignored',
  });
  assert.equal(bindings.READY_DEMO_MODEL, 'mock');
  assert.equal(bindings.READY_SIGN_IN, 'on');
  assert.equal(bindings.READY_MODE, undefined);
  assert.equal(bindings.AI_GATEWAY_TOKEN, 'dummy-gateway-token-not-real');
  assert.equal(bindings.AI_GATEWAY_ACCOUNT_ID, 'dummy-account-not-real');
  assert.equal(bindings.AI_GATEWAY_BASE_URL, undefined);
  assert.equal(bindings.AI_GATEWAY_ID, undefined);
  assert.equal('OTHER' in bindings, false);
});
