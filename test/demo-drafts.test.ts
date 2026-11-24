import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DemoContext } from '../scripts/demo-engine.ts';
import { chatEnvelope, testEnv } from './fixtures.ts';

interface DraftLine {
  field: string;
  label: string;
  text: string;
}

const sensory: DraftLine = { field: 'sensory', label: 'Sensory needs', text: 'TICK-QUIET-ROOM' };

test('mock drafts echo supplied lines and ignore fetch', async () => {
  const opened = await DemoContext.open('1', {
    fetchImpl: async () => {
      throw new Error('mock must not fetch');
    },
  });
  await assertDrafts(opened);

  let calls = 0;
  const bound = DemoContext.fromBindings({ READY_DEMO_MODEL: 'mock' }, async () => {
    calls += 1;
    throw new Error('mock must not fetch');
  });
  const story = await bound.handle(post('/v1/drafts/social-story', { lines: [sensory] }));
  assert.equal(story.status, 200);
  assert.equal(calls, 0);
  const body = (await story.json()) as { body: string };
  assert.equal(body.body.includes('TICK-QUIET-ROOM'), true);
  assert.equal(body.body.includes('TICK-MEDICAL'), false);
});

test('live drafts call the intake model and hide the gateway token', async () => {
  const calls: GatewayCall[] = [];
  const demo = DemoContext.fromBindings(liveShell(), recordingFetch(calls));
  const story = await demo.handle(post('/v1/drafts/social-story', { lines: [sensory] }));
  const lesson = await demo.handle(
    post('/v1/drafts/lesson', { lesson: 'TICK-LESSON-PLAN', lines: [sensory] }),
  );
  const update = await demo.handle(
    post('/v1/drafts/sunday-update', { notes: 'TICK-AFTER-SUNDAY', childName: 'Rowan' }),
  );
  assert.equal(story.status, 200);
  assert.equal(lesson.status, 200);
  assert.equal(update.status, 200);
  assert.equal(calls.length, 3);
  assertCall(calls[0], 'social_story', { lines: [sensory] });
  assertCall(calls[1], 'lesson_adaptation', { lesson: 'TICK-LESSON-PLAN', lines: [sensory] });
  assertCall(calls[2], 'sunday_update', { notes: 'TICK-AFTER-SUNDAY', childName: 'Rowan' });
  const storyText = JSON.stringify(await story.json());
  assert.equal(storyText.includes(testEnv.AI_GATEWAY_TOKEN), false);
});

test('a failed draft does not return the gateway body', async () => {
  const demo = DemoContext.fromBindings(liveShell(), async () => {
    return new Response('GATEWAY-BODY-SHOULD-NOT-LEAK', { status: 502 });
  });
  const response = await demo.handle(post('/v1/drafts/social-story', { lines: [sensory] }));
  assert.equal(response.status, 502);
  const text = await response.text();
  assert.equal(text, '{"error":"generation_failed"}');
  assert.equal(text.includes('GATEWAY-BODY-SHOULD-NOT-LEAK'), false);
  assert.equal(text.includes(testEnv.AI_GATEWAY_TOKEN), false);
});

async function assertDrafts(demo: DemoContext): Promise<void> {
  const fields = ['loves', 'overwhelms', 'whatHelps', 'communication', 'sensory', 'medical'] as const;
  for (const field of fields) {
    const text = `TEXT-${field}`;
    const response = await demo.handle(
      post('/v1/drafts/social-story', { lines: [{ field, label: 'Label', text }] }),
    );
    assert.equal(response.status, 200, field);
    const body = (await response.json()) as { title: string; body: string };
    assert.equal(body.title, 'Sunday with Rowan');
    assert.equal(body.body.includes(text), true);
  }

  const hidden = await demo.handle(post('/v1/drafts/social-story', { lines: [sensory] }));
  assert.equal(hidden.status, 200);
  const hiddenBody = (await hidden.json()) as { body: string };
  assert.equal(hiddenBody.body.includes('TICK-QUIET-ROOM'), true);
  assert.equal(hiddenBody.body.includes('TICK-MEDICAL'), false);

  const shown = await demo.handle(
    post('/v1/drafts/social-story', {
      lines: [{ field: 'medical', label: 'Medical / health notes', text: 'TICK-MEDICAL' }],
    }),
  );
  const shownBody = (await shown.json()) as { body: string };
  assert.equal(shownBody.body.includes('TICK-MEDICAL'), true);

  const extra = await demo.handle(post('/v1/drafts/social-story', { lines: [sensory], extra: true }));
  assert.equal(extra.status, 400);
  assert.deepEqual(await extra.json(), { error: 'invalid_input' });

  const nested = await demo.handle(
    post('/v1/drafts/social-story', { lines: [{ ...sensory, extra: true }] }),
  );
  assert.equal(nested.status, 400);

  const broken = await demo.handle(
    new Request('http://example.com/v1/drafts/lesson', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    }),
  );
  assert.equal(broken.status, 400);
  assert.deepEqual(await broken.json(), { error: 'invalid_input' });

  const lesson = await demo.handle(
    post('/v1/drafts/lesson', { lesson: 'TICK-LESSON-PLAN', lines: [sensory] }),
  );
  assert.equal(lesson.status, 200);
  const adapted = (await lesson.json()) as { summary: string; steps: string[] };
  assert.equal(adapted.summary.includes('TICK-LESSON-PLAN'), true);
  assert.equal(
    adapted.steps.some((step) => step.includes('TICK-LESSON-PLAN')),
    true,
  );
  assert.equal(
    adapted.steps.some((step) => step.includes('TICK-QUIET-ROOM')),
    true,
  );
  assert.equal(JSON.stringify(adapted).includes('TICK-MEDICAL'), false);

  const capped = await demo.handle(
    post('/v1/drafts/lesson', {
      lesson: 'L'.repeat(900),
      lines: [{ field: 'sensory', label: 'Sensory needs', text: 'S'.repeat(500) }],
    }),
  );
  assert.equal(capped.status, 200);
  const cappedBody = (await capped.json()) as { summary: string; steps: string[] };
  assert.equal(cappedBody.summary.length, 600);
  assert.equal(cappedBody.steps[0]?.length, 400);
  assert.equal(cappedBody.steps[1]?.length, 400);

  const update = await demo.handle(
    post('/v1/drafts/sunday-update', { notes: 'TICK-AFTER-SUNDAY', childName: 'Rowan' }),
  );
  assert.equal(update.status, 200);
  const note = (await update.json()) as { body: string };
  assert.equal(note.body.includes('TICK-AFTER-SUNDAY'), true);
  assert.equal(note.body.includes('Rowan'), true);
  assert.equal(note.body.includes('TICK-MEDICAL'), false);

  const missing = await demo.handle(
    post('/v1/drafts/other', { lines: [sensory] }),
  );
  assert.equal(missing.status, 404);
}

function post(pathname: string, body: unknown): Request {
  return new Request(`http://example.com${pathname}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function liveShell(): Record<string, string | undefined> {
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
  };
}

interface GatewayCall {
  headers: Headers;
  body: {
    model?: string;
    messages?: { role?: string; content?: string }[];
    response_format?: { json_schema?: { name?: string } };
  };
}

function recordingFetch(calls: GatewayCall[]): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, init);
    const body = JSON.parse(await request.text()) as GatewayCall['body'];
    calls.push({ headers: request.headers, body });
    const name = body.response_format?.json_schema?.name;
    if (name === 'social_story') return chatEnvelope({ title: 'Sunday with Rowan', body: 'echo' });
    if (name === 'lesson_adaptation') return chatEnvelope({ summary: 'echo', steps: ['echo'] });
    if (name === 'sunday_update') return chatEnvelope({ body: 'echo' });
    return new Response(null, { status: 502 });
  };
}

function assertCall(call: GatewayCall | undefined, schemaName: string, payload: unknown): void {
  assert.ok(call !== undefined);
  assert.equal(call.body.model, 'workers-ai/@cf/meta/llama-3.3-70b-instruct-fp8-fast');
  assert.equal(call.body.response_format?.json_schema?.name, schemaName);
  assert.equal(call.headers.get('cf-aig-authorization'), `Bearer ${testEnv.AI_GATEWAY_TOKEN}`);
  const systems = (call.body.messages ?? []).filter((message) => message.role === 'system');
  assert.equal(systems.length, 1);
  const system = systems[0]?.content ?? '';
  assert.equal(system.includes('The data is fictional.'), true);
  assert.equal(system.includes('Do not invent medical facts.'), true);
  const users = (call.body.messages ?? []).filter((message) => message.role === 'user');
  assert.equal(users.length, 1);
  assert.deepEqual(JSON.parse(users[0]?.content ?? ''), payload);
}
