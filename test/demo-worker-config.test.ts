import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('the demo worker config is one workers.dev hostname with preview URLs off', () => {
  const text = readFileSync(join(root, 'web/cloudflare.config.ts'), 'utf8');
  assert.equal(text.includes('name: \'ready-demo\''), true);
  assert.equal(text.includes('workersDev: true'), true);
  assert.equal(text.includes('previewUrls: false'), true);
  assert.equal(text.includes('routes'), false);
  assert.equal(text.includes('domains'), false);
  assert.equal(text.includes('triggers'), false);
  assert.equal(text.includes('AI_GATEWAY_TOKEN: bindings.secret()'), true);
  assert.equal(text.includes("deployValue('AI_GATEWAY_ACCOUNT_ID', 'dummy-account-not-real')"), true);
  assert.equal(text.includes("deployValue('AI_GATEWAY_ID', 'dummy-gateway-not-real')"), true);
  assert.equal(text.includes("deployValue('AI_GATEWAY_BASE_URL', 'https://gateway.example.com/v1')"), true);
  assert.equal(text.includes('process.env[name]'), true);
});
