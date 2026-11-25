import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DemoContext } from '../scripts/demo-engine.ts';
import { assertAdapterAllowed } from '../src/adapter.ts';
import { ConfigError } from '../src/errors.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function throwsConfig(run: () => void): void {
  assert.throws(run, (error: unknown) => error instanceof ConfigError);
}

test('account mode refuses to start on the memory adapter', async () => {
  throwsConfig(() => assertAdapterAllowed({ READY_SIGN_IN: 'on' }, 'memory'));
  throwsConfig(() => assertAdapterAllowed({ READY_MODE: 'account' }, 'memory'));
  throwsConfig(() => assertAdapterAllowed({ READY_SIGN_IN: 'on', READY_MODE: 'account' }, 'memory'));
  assert.doesNotThrow(() => assertAdapterAllowed({ READY_SIGN_IN: 'on', READY_MODE: 'account' }, 'supabase'));
  assert.doesNotThrow(() => assertAdapterAllowed({ READY_SIGN_IN: 'true', READY_MODE: 'demo' }, 'memory'));
  assert.doesNotThrow(() => assertAdapterAllowed({}, 'memory'));

  throwsConfig(() => DemoContext.fromBindings({ READY_DEMO_MODEL: 'mock', READY_SIGN_IN: 'on' }));
  throwsConfig(() => DemoContext.fromBindings({ READY_DEMO_MODEL: 'mock', READY_MODE: 'account' }));
  await assert.rejects(
    DemoContext.open('1', { shell: { READY_SIGN_IN: 'on' } }),
    (error: unknown) => error instanceof ConfigError,
  );
  await assert.rejects(
    DemoContext.open('1', { shell: { READY_MODE: 'account' } }),
    (error: unknown) => error instanceof ConfigError,
  );

  const demo = DemoContext.fromBindings({ READY_DEMO_MODEL: 'mock' });
  const health = await demo.handle(new Request('http://example.com/healthz'));
  assert.equal(health.status, 200);
  const closed = await demo.handle(new Request('http://example.com/v1/access/membership'));
  assert.equal(closed.status, 404);
});

test('the account worker stays on the supabase user check', () => {
  const index = readFileSync(join(root, 'src/index.ts'), 'utf8');
  const app = readFileSync(join(root, 'src/app.ts'), 'utf8');
  const demo = readFileSync(join(root, 'scripts/demo-engine.ts'), 'utf8');
  assert.equal(index.includes('supabaseAuthVerifier'), true);
  assert.equal(index.includes('sessionAuthVerifier'), false);
  assert.equal(index.includes('session-auth'), false);
  assert.equal(index.includes('memoryAccessSource'), false);
  assert.equal(index.includes('verifyHs256'), false);
  assert.equal(app.includes('verifyHs256'), false);
  assert.equal(app.includes("if (!signInEnabled(deps.env.READY_SIGN_IN)) return json({ error: 'not_found' }, 404);"), true);
  assert.equal(demo.includes('test/fixtures'), false);
  assert.equal(demo.includes('signHs256'), false);
  assert.equal(demo.includes('memoryAccessSource'), true);
});
