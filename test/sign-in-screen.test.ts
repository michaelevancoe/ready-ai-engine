import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { signInOpen } from '../web/server/sign-in-gate.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('the sign-in screen is off unless the flag is exactly on', () => {
  const previous = process.env.READY_SIGN_IN;
  delete process.env.READY_SIGN_IN;
  assert.equal(signInOpen(), false);
  process.env.READY_SIGN_IN = 'true';
  assert.equal(signInOpen(), false);
  process.env.READY_SIGN_IN = 'on ';
  assert.equal(signInOpen(), false);
  process.env.READY_SIGN_IN = ' on';
  assert.equal(signInOpen(), false);
  process.env.READY_SIGN_IN = 'on';
  assert.equal(signInOpen(), true);
  if (previous === undefined) delete process.env.READY_SIGN_IN;
  else process.env.READY_SIGN_IN = previous;

  const layout = readFileSync(join(root, 'web/app/layout.tsx'), 'utf8');
  const flow = readFileSync(join(root, 'web/app/sign-in-flow.tsx'), 'utf8');
  const machine = readFileSync(join(root, 'web/lib/sign-in.ts'), 'utf8');
  const worker = readFileSync(join(root, 'web/worker/index.ts'), 'utf8');
  const config = readFileSync(join(root, 'web/cloudflare.config.ts'), 'utf8');
  const wrangler = readFileSync(join(root, 'wrangler.toml'), 'utf8');
  for (const text of [layout, flow, machine, worker, config, wrangler]) {
    assert.equal(text.includes('READY_SIGN_IN'), false);
  }
  assert.equal(layout.includes('signInOpen'), true);
  assert.equal(flow.includes('Check your email'), true);
  assert.equal(flow.includes("This invite isn't active"), true);
  assert.equal(flow.includes('Choose your church'), true);
  assert.equal(flow.includes('Your invite expired'), false);
  assert.equal(flow.includes('not invited'), false);
});
