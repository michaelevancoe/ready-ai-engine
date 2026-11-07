import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GenerateError } from '../src/errors.ts';
import { generate, type ChatMessage } from '../src/generate.ts';
import { gatewayChatCompletionsUrl } from '../src/gateway.ts';
import type { SafeLog } from '../src/log.ts';
import { parseChildProfile } from '../src/profile.ts';
import { childProfileSchema, childProfileSchemaName } from '../src/profile.ts';
import { chatEnvelope, sampleProfile, testEnv } from './fixtures.ts';

const messages: ChatMessage[] = [
  { role: 'system', content: 'Return JSON only.' },
  { role: 'user', content: 'SENSORY-NOTE-ORANGE-BLOCK' },
];

function models(calls: { model: string }[]): string[] {
  return calls.map((call) => call.model);
}

async function run(handler: (calls: RequestCall[]) => Response | Promise<Response>) {
  const calls: RequestCall[] = [];
  const logs: SafeLog[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const body = JSON.parse(String(init?.body)) as { model: string; messages: ChatMessage[] };
    const headers = new Headers(init?.headers);
    calls.push({ url, model: body.model, messages: body.messages, headers, init });
    return handler(calls);
  };
  const result = generate({
    endpoint: 'intake.profile',
    messages,
    schemaName: childProfileSchemaName,
    schema: childProfileSchema,
    parse: parseChildProfile,
    env: testEnv,
    fetch: fetchImpl,
    log: (event) => logs.push(event),
  });
  return { calls, logs, result };
}

interface RequestCall {
  url: string;
  model: string;
  messages: ChatMessage[];
  headers: Headers;
  init: RequestInit | undefined;
}

test('generate calls the gateway URL built from env and does not log the prompt', async () => {
  const { calls, logs, result } = await run(() => chatEnvelope(sampleProfile()));
  const profile = await result;
  assert.deepEqual(profile, sampleProfile());
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0]?.url,
    'https://gateway.example.com/v1/dummy-account-not-real/dummy-gateway-not-real/compat/chat/completions',
  );
  assert.equal(calls[0]?.url, gatewayChatCompletionsUrl(testEnv));
  assert.equal(calls[0]?.model, 'openai/dummy-primary-model-not-real');
  assert.equal(calls[0]?.headers.get('cf-aig-authorization'), 'Bearer dummy-gateway-token-not-real');
  assert.equal(calls[0]?.headers.get('cf-aig-collect-log-payload'), 'false');
  assert.equal(calls[0]?.headers.get('authorization'), null);
  assert.equal(logs.length, 1);
  assert.equal(logs[0]?.outcome, 'success');
  assert.equal(JSON.stringify(logs).includes('SENSORY-NOTE-ORANGE-BLOCK'), false);
});

test('retries the primary model once after schema rejection', async () => {
  const { calls, logs, result } = await run((seen) => {
    if (seen.length === 1) return chatEnvelope({ summary: 1 });
    return chatEnvelope(sampleProfile());
  });
  await result;
  assert.deepEqual(models(calls), [
    'openai/dummy-primary-model-not-real',
    'openai/dummy-primary-model-not-real',
  ]);
  assert.deepEqual(
    logs.map((entry) => entry.outcome),
    ['schema_rejected', 'success'],
  );
  assert.equal(logs[0]?.phase, 'primary');
  assert.equal(logs[1]?.phase, 'retry');
});

test('retries once after a gateway error', async () => {
  const { calls, result } = await run((seen) => {
    if (seen.length === 1) return new Response('nope', { status: 500 });
    return chatEnvelope(sampleProfile());
  });
  await result;
  assert.equal(calls.length, 2);
  assert.equal(calls[1]?.model, 'openai/dummy-primary-model-not-real');
});

test('falls back to the second configured model after the primary retry fails', async () => {
  const { calls, logs, result } = await run((seen) => {
    if (seen.length < 3) return new Response('nope', { status: 502 });
    return chatEnvelope(sampleProfile());
  });
  const profile = await result;
  assert.equal(profile.summary, sampleProfile().summary);
  assert.deepEqual(models(calls), [
    'openai/dummy-primary-model-not-real',
    'openai/dummy-primary-model-not-real',
    'workers-ai/dummy-fallback-model-not-real',
  ]);
  assert.equal(logs[2]?.phase, 'fallback');
  assert.equal(logs[2]?.outcome, 'success');
});

test('rejects invalid model JSON and fails closed without echoing the prompt', async () => {
  const { logs, result } = await run(() => chatEnvelope({ summary: 'missing the rest' }));
  await assert.rejects(result, (error: unknown) => {
    assert.ok(error instanceof GenerateError);
    assert.equal(error.reason, 'schema');
    assert.equal(error.message.includes('SENSORY-NOTE-ORANGE-BLOCK'), false);
    return true;
  });
  assert.deepEqual(
    logs.map((entry) => entry.phase),
    ['primary', 'retry', 'fallback'],
  );
  assert.equal(JSON.stringify(logs).includes('SENSORY-NOTE-ORANGE-BLOCK'), false);
});

test('the default logger records attempt metadata only', async () => {
  const lines: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (line?: unknown) => {
    lines.push(String(line));
  };
  console.error = (line?: unknown) => {
    lines.push(String(line));
  };
  try {
    let attempt = 0;
    await generate({
      endpoint: 'intake.profile',
      messages,
      schemaName: childProfileSchemaName,
      schema: childProfileSchema,
      parse: parseChildProfile,
      env: testEnv,
      fetch: async () => {
        attempt += 1;
        if (attempt === 1) return chatEnvelope({ summary: 'SENSORY-NOTE-ORANGE-BLOCK leaked' });
        return chatEnvelope(sampleProfile());
      },
    });
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
  const output = lines.join('\n');
  assert.equal(output.includes('SENSORY-NOTE-ORANGE-BLOCK'), false);
  assert.match(output, /schema_rejected/);
  assert.match(output, /dummy-primary-model-not-real/);
});

test('treats a thrown fetch as a gateway error and then falls back', async () => {
  let attempt = 0;
  const logs: SafeLog[] = [];
  const fetchImpl: typeof fetch = async () => {
    attempt += 1;
    if (attempt < 3) throw new Error('SENSORY-NOTE-ORANGE-BLOCK network down');
    return chatEnvelope(sampleProfile());
  };
  const profile = await generate({
    endpoint: 'intake.profile',
    messages,
    schemaName: childProfileSchemaName,
    schema: childProfileSchema,
    parse: parseChildProfile,
    env: testEnv,
    fetch: fetchImpl,
    log: (event) => logs.push(event),
  });
  assert.equal(profile.volunteerGuidance, sampleProfile().volunteerGuidance);
  assert.equal(logs[0]?.outcome, 'error');
  assert.equal(JSON.stringify(logs).includes('SENSORY-NOTE-ORANGE-BLOCK'), false);
});
