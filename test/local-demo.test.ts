import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { openDemo as openNodeDemo } from '../scripts/demo-server.ts';
import { DemoContext } from '../scripts/demo-engine.ts';
import { ConfigError } from '../src/errors.ts';
import { gatewayChatCompletionsUrl } from '../src/gateway.ts';
import { demoModelMode, localDemoEnabled } from '../web/lib/local-demo.ts';
import { chatEnvelope, sampleProfile, testEnv } from './fixtures.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('local demo is on only for the string 1', () => {
  assert.equal(localDemoEnabled(undefined), false);
  assert.equal(localDemoEnabled('true'), false);
  assert.equal(localDemoEnabled('1'), true);
});

test('the worker entry and wrangler config do not read the local demo flag', () => {
  const wrangler = readFileSync(join(root, 'wrangler.toml'), 'utf8');
  const entry = readFileSync(join(root, 'src/index.ts'), 'utf8');
  assert.equal(wrangler.includes('READY_LOCAL_DEMO'), false);
  assert.equal(entry.includes('READY_LOCAL_DEMO'), false);
  assert.equal(wrangler.includes('READY_DEMO_MODEL'), false);
  assert.equal(entry.includes('READY_DEMO_MODEL'), false);
});

test('demo open rejects when the flag is off', async () => {
  await assert.rejects(DemoContext.open(undefined), { message: 'READY_LOCAL_DEMO is off' });
});

test('intake uses the typed note, then approve, then a second approve conflicts', async () => {
  const demo = await DemoContext.open('1');
  const intake = await demo.handle(
    new Request('http://example.com/v1/intake/profile', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer leaked',
      },
      body: JSON.stringify({
        preferredName: 'Rowan',
        ageYears: 7,
        sensoryNotes: 'TICK-QUIET-ROOM',
        supportNeeds: 'A quiet seat near the door.',
        whatHelps: 'A warning before music.',
        whatToAvoid: 'Surprise loud songs.',
      }),
    }),
  );
  assert.equal(intake.status, 201);
  const drafted = (await intake.json()) as {
    id: string;
    status: string;
    profile: { sensoryConsiderations: string[] };
  };
  assert.equal(drafted.status, 'draft');
  assert.equal(drafted.profile.sensoryConsiderations[0], 'TICK-QUIET-ROOM');

  const approve = await demo.handle(
    new Request(`http://example.com/v1/profiles/${drafted.id}/approve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }),
  );
  assert.equal(approve.status, 200);
  const approved = (await approve.json()) as { status: string };
  assert.equal(approved.status, 'approved');

  const again = await demo.handle(
    new Request(`http://example.com/v1/profiles/${drafted.id}/approve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }),
  );
  assert.equal(again.status, 409);
});

test('demo model mode is live only for the exact string live', () => {
  assert.equal(demoModelMode(undefined), 'mock');
  assert.equal(demoModelMode('mock'), 'mock');
  assert.equal(demoModelMode('LIVE'), 'mock');
  assert.equal(demoModelMode(''), 'mock');
  assert.equal(demoModelMode('other'), 'mock');
  assert.equal(demoModelMode('live'), 'live');
});

test('.gitignore ignores .dev.vars', () => {
  const lines = readFileSync(join(root, '.gitignore'), 'utf8').split('\n');
  assert.equal(
    lines.some((line) => line.trim() === '.dev.vars'),
    true,
  );
});

test('mock intake ignores a fetch that throws', async () => {
  const demo = await DemoContext.open('1', {
    fetchImpl: async () => {
      throw new Error('mock must not fetch');
    },
  });
  const intake = await demo.handle(quietRoomIntake());
  assert.equal(intake.status, 201);
});

test('live intake sends the six answers to the dummy gateway once', async () => {
  const calls: GatewayCall[] = [];
  const demo = await DemoContext.open('1', {
    fromEnvironment: true,
    model: 'live',
    readDevVarsFile: false,
    shell: liveShell(),
    fetchImpl: recordingFetch(calls),
  });
  const intake = await demo.handle(quietRoomIntake());
  assert.equal(intake.status, 201);
  const responseText = await intake.text();
  assert.equal(responseText.includes(testEnv.AI_GATEWAY_TOKEN), false);
  assert.equal(calls.length, 1);
  const call = calls[0];
  assert.ok(call !== undefined);
  assert.equal(call.url, gatewayChatCompletionsUrl(testEnv));
  assert.equal(
    call.url,
    'https://gateway.example.com/v1/dummy-account-not-real/dummy-gateway-not-real/compat/chat/completions',
  );
  assert.equal(call.headers.get('cf-aig-authorization'), `Bearer ${testEnv.AI_GATEWAY_TOKEN}`);
  assert.equal(call.headers.get('cf-aig-collect-log-payload'), 'false');
  assert.equal(call.body.model, 'workers-ai/@cf/meta/llama-3.3-70b-instruct-fp8-fast');
  const users = (call.body.messages ?? []).filter((message) => message.role === 'user');
  assert.equal(users.length, 1);
  const answers = JSON.parse(users[0]?.content ?? '') as Record<string, unknown>;
  assert.deepEqual(answers, {
    preferredName: 'Rowan',
    ageYears: 7,
    sensoryNotes: 'TICK-QUIET-ROOM',
    supportNeeds: 'A quiet seat near the door.',
    whatHelps: 'A warning before music.',
    whatToAvoid: 'Surprise loud songs.',
  });
});

test('live mode rejects a non workers-ai provider before fetch', async () => {
  await assertLiveRejected(liveShell({ INTAKE_PROFILE_PROVIDER: 'openai' }));
});

test('live mode rejects an empty gateway token before fetch', async () => {
  await assertLiveRejected(liveShell({ AI_GATEWAY_TOKEN: '' }));
});

test('worker bindings use the mock and skip fetch when the model is not live', async () => {
  let calls = 0;
  const demo = DemoContext.fromBindings({ ...liveShell(), READY_DEMO_MODEL: 'mock' }, async () => {
    calls += 1;
    throw new Error('mock must not fetch');
  });
  const intake = await demo.handle(quietRoomIntake());
  assert.equal(intake.status, 201);
  assert.equal(calls, 0);
  assert.equal((await intake.text()).includes('TICK-QUIET-ROOM'), true);
});

test('worker bindings reject an empty gateway token before fetch', () => {
  assert.throws(() => DemoContext.fromBindings(liveShell({ AI_GATEWAY_TOKEN: '' })), (error: unknown) => {
    assert.ok(error instanceof ConfigError);
    assert.equal(error.message.includes(testEnv.AI_GATEWAY_TOKEN), false);
    return true;
  });
});

test('live mode rejects a fallback provider other than workers-ai before fetch', async () => {
  await assertLiveRejected(liveShell({ INTAKE_PROFILE_FALLBACK_PROVIDER: 'openai' }));
});

test('a missing or present .dev.vars still opens the mock when the shell says mock', async () => {
  const demo = await openNodeDemo('1', {
    fromEnvironment: true,
    shell: { READY_DEMO_MODEL: 'mock' },
    fetchImpl: async () => {
      throw new Error('mock must not fetch');
    },
  });
  const intake = await demo.handle(quietRoomIntake());
  assert.equal(intake.status, 201);
});

test('an explicit mock model does not call fetch', async () => {
  let calls = 0;
  const demo = await DemoContext.open('1', {
    fromEnvironment: true,
    model: 'mock',
    readDevVarsFile: false,
    shell: liveShell(),
    fetchImpl: async () => {
      calls += 1;
      throw new Error('mock must not fetch');
    },
  });
  const intake = await demo.handle(quietRoomIntake());
  assert.equal(intake.status, 201);
  assert.equal(calls, 0);
  const body = await intake.text();
  assert.equal(body.includes('TICK-QUIET-ROOM'), true);
});

test('shell overrides .dev.vars, including a quoted token', async () => {
  const calls: GatewayCall[] = [];
  const demo = await DemoContext.open('1', {
    fromEnvironment: true,
    readDevVarsFile: false,
    devVarsText: [
      '# comment',
      '',
      'READY_DEMO_MODEL=mock',
      'AI_GATEWAY_BASE_URL=https://gateway.example.com/v1',
      'AI_GATEWAY_ACCOUNT_ID=file-account',
      'AI_GATEWAY_ID=dummy-gateway-not-real',
      `AI_GATEWAY_TOKEN="${testEnv.AI_GATEWAY_TOKEN}"`,
      'INTAKE_PROFILE_PROVIDER=workers-ai',
      'INTAKE_PROFILE_MODEL=@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      'INTAKE_PROFILE_FALLBACK_PROVIDER=workers-ai',
      'INTAKE_PROFILE_FALLBACK_MODEL=@cf/meta/llama-3.1-8b-instruct',
      'SUPABASE_URL=https://should-not-be-used.example.com',
    ].join('\n'),
    shell: {
      READY_DEMO_MODEL: 'live',
      AI_GATEWAY_ACCOUNT_ID: testEnv.AI_GATEWAY_ACCOUNT_ID,
    },
    fetchImpl: recordingFetch(calls),
  });
  const intake = await demo.handle(quietRoomIntake());
  assert.equal(intake.status, 201);
  assert.equal(calls.length, 1);
  const call = calls[0];
  assert.ok(call !== undefined);
  assert.equal(call.url, gatewayChatCompletionsUrl(testEnv));
  assert.equal(call.url.includes('file-account'), false);
  assert.equal(call.url.includes('should-not-be-used'), false);
  assert.equal(call.headers.get('cf-aig-authorization'), `Bearer ${testEnv.AI_GATEWAY_TOKEN}`);
});

function quietRoomIntake(): Request {
  return new Request('http://example.com/v1/intake/profile', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      preferredName: 'Rowan',
      ageYears: 7,
      sensoryNotes: 'TICK-QUIET-ROOM',
      supportNeeds: 'A quiet seat near the door.',
      whatHelps: 'A warning before music.',
      whatToAvoid: 'Surprise loud songs.',
    }),
  });
}

function liveShell(overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    READY_DEMO_MODEL: 'live',
    AI_GATEWAY_BASE_URL: testEnv.AI_GATEWAY_BASE_URL,
    AI_GATEWAY_ACCOUNT_ID: testEnv.AI_GATEWAY_ACCOUNT_ID,
    AI_GATEWAY_ID: testEnv.AI_GATEWAY_ID,
    AI_GATEWAY_TOKEN: testEnv.AI_GATEWAY_TOKEN,
    INTAKE_PROFILE_PROVIDER: 'workers-ai',
    INTAKE_PROFILE_MODEL: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    INTAKE_PROFILE_FALLBACK_PROVIDER: 'workers-ai',
    INTAKE_PROFILE_FALLBACK_MODEL: '@cf/meta/llama-3.1-8b-instruct',
    ...overrides,
  };
}

interface GatewayCall {
  url: string;
  headers: Headers;
  body: {
    model?: string;
    messages?: { role?: string; content?: string }[];
  };
}

function recordingFetch(calls: GatewayCall[]): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, init);
    const body = JSON.parse(await request.text()) as GatewayCall['body'];
    calls.push({ url: request.url, headers: request.headers, body });
    return chatEnvelope(sampleProfile());
  };
}

async function assertLiveRejected(shell: Record<string, string | undefined>): Promise<void> {
  let calls = 0;
  await assert.rejects(
    DemoContext.open('1', {
      fromEnvironment: true,
      readDevVarsFile: false,
      shell,
      fetchImpl: async () => {
        calls += 1;
        throw new Error('live misconfiguration must not fetch');
      },
    }),
    (error: unknown) => {
      assert.ok(error instanceof ConfigError);
      assert.equal(error.message, 'gateway configuration is incomplete');
      assert.equal(error.message.includes('openai'), false);
      assert.equal(error.message.includes(testEnv.AI_GATEWAY_TOKEN), false);
      return true;
    },
  );
  assert.equal(calls, 0);
}
