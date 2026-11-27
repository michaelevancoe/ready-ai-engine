import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DemoContext } from '../scripts/demo-engine.ts';
import { testEnv } from './fixtures.ts';

const shell = {
  READY_DEMO_MODEL: 'live',
  AI_GATEWAY_BASE_URL: testEnv.AI_GATEWAY_BASE_URL,
  AI_GATEWAY_ACCOUNT_ID: testEnv.AI_GATEWAY_ACCOUNT_ID,
  AI_GATEWAY_ID: testEnv.AI_GATEWAY_ID,
  AI_GATEWAY_TOKEN: testEnv.AI_GATEWAY_TOKEN,
  INTAKE_PROFILE_PROVIDER: 'workers-ai',
  INTAKE_PROFILE_MODEL: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  INTAKE_PROFILE_FALLBACK_PROVIDER: 'workers-ai',
  INTAKE_PROFILE_FALLBACK_MODEL: '@cf/meta/llama-3.1-8b-instruct',
};

const profile = {
  summary: 'Theo, age 8. A parent still needs to approve this draft.',
  sensoryConsiderations: ['Bright rooms are hard.'],
  supportStrategies: ['A quiet corner helps.'],
  avoid: ['Sudden loud songs.'],
  volunteerGuidance: 'Explain the next activity first.',
};

const ack = { relevant: true, line: 'Thanks. That helps.', clarifyingPrompt: '' };

const theo = [
  ['name', 'Theo'],
  ['age', '8'],
  ['about', 'Theo likes a quiet hello and trains.'],
  ['loves', 'Trains and drawing.'],
  ['overwhelms', 'Crowded doorways and sudden songs.'],
  ['helps', 'A quiet corner'],
  ['helps-more', 'A heads-up before changes.'],
  ['communication', 'Picture cards and a few words.'],
  ['sensory', 'Bright rooms are hard.'],
  ['toileting', 'Tells an adult'],
  ['allergies', 'Food allergy'],
  ['allergies-more', 'Peanuts make Theo itchy. Tell a leader.'],
  ['behavior', 'No, not usually'],
] as const;

function envelope(content: unknown): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { role: 'assistant', content: JSON.stringify(content) } }] }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

function limitedFetch(): { fetch: typeof fetch; calls: () => number } {
  const times: number[] = [];
  let calls = 0;
  const fetchImpl: typeof fetch = async (_input, init) => {
    const now = Date.now();
    while (times.length > 0 && times[0] !== undefined && now - times[0] >= 60_000) times.shift();
    calls += 1;
    if (times.length >= 20) {
      return new Response('rate limited', { status: 429, headers: { 'retry-after': '2' } });
    }
    times.push(now);
    const body = JSON.parse(String(init?.body)) as {
      response_format?: { json_schema?: { name?: string } };
    };
    const name = body.response_format?.json_schema?.name;
    if (name === 'child_profile') return envelope(profile);
    if (name === 'intake_acknowledgement') return envelope(ack);
    return new Response('unexpected schema', { status: 500 });
  };
  return { fetch: fetchImpl, calls: () => calls };
}

function post(pathname: string, body: unknown): Request {
  return new Request(new URL(pathname, 'http://example.com'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function walk(demo: DemoContext): Promise<void> {
  for (const [nodeId, answer] of theo) {
    const response = await demo.handle(post('/v1/drafts/acknowledgement', { answer, nodeId }));
    assert.equal(response.status, 200, nodeId);
  }
}

function intake(): Request {
  return post('/v1/intake/profile', {
    preferredName: 'Theo',
    ageYears: 8,
    sensoryNotes: 'Bright rooms are hard.',
    supportNeeds: 'Picture cards.',
    whatHelps: 'A quiet corner and a heads-up before changes.',
    whatToAvoid: 'Crowded doorways.',
  });
}

test('two Theo walks inside one minute still draft the profile on the first try', async () => {
  const gateway = limitedFetch();
  const demo = DemoContext.fromBindings(shell, gateway.fetch);
  await walk(demo);
  const first = await demo.handle(intake());
  assert.equal(first.status, 201);
  await walk(demo);
  const second = await demo.handle(intake());
  assert.equal(second.status, 201, `gateway calls ${gateway.calls()}`);
});
