import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DemoContext } from '../scripts/demo-engine.ts';
import { parseSocialStory, parseSundayUpdate } from '../src/demo-drafts.ts';
import { SchemaRejected } from '../src/errors.ts';
import { chatEnvelope, testEnv } from './fixtures.ts';

interface DraftLine {
  field: string;
  label: string;
  text: string;
}

const sensory: DraftLine = { field: 'sensory', label: 'Sensory needs', text: 'TICK-QUIET-ROOM' };
const proseStory = 'You arrive and the room is quiet. Soft music helps.';
const labelStory =
  'Loves. Overwhelms. What helps. Communication. Sensory needs. Medical / health notes.';

const NEXT_QUESTION = 'How does Rowan usually let you know what he needs?';

test('mock acknowledgement returns a line and does not fetch', async () => {
  let calls = 0;
  const demo = await DemoContext.open('1', {
    fetchImpl: async () => {
      calls += 1;
      throw new Error('mock must not fetch');
    },
  });
  const response = await demo.handle(
    post('/v1/drafts/acknowledgement', { answer: 'Picture cards.', sectionTitle: 'Communication' }),
  );
  assert.equal(calls, 0);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { line: 'Thanks for telling me.' });
});

test('a live acknowledgement records the intake schema and leaves out the next question', async () => {
  const calls: GatewayCall[] = [];
  const logs: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(' '));
  };
  try {
    const demo = DemoContext.fromBindings(liveShell(), async (input, init) => {
      const request = new Request(input, init);
      calls.push({ headers: request.headers, body: JSON.parse(await request.text()) as GatewayCall['body'] });
      return chatEnvelope({ line: 'Thanks for telling me.' });
    });
    const response = await demo.handle(
      post('/v1/drafts/acknowledgement', { answer: 'Picture cards.', sectionTitle: 'Communication' }),
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { line: 'Thanks for telling me.' });
    const user = calls[0]?.body.messages?.find((message) => message.role === 'user')?.content ?? '';
    assert.equal(calls[0]?.body.response_format?.json_schema?.name, 'intake_acknowledgement');
    assert.equal(calls[0]?.body.model, 'workers-ai/@cf/meta/llama-3.3-70b-instruct-fp8-fast');
    assert.equal(user.includes('Picture cards.'), true);
    assert.equal(user.includes('Communication'), true);
    assert.equal(user.includes(NEXT_QUESTION), false);
    assert.equal(logs.some((line) => line.includes('"endpoint":"intake.profile"')), true);
  } finally {
    console.log = original;
  }
});

test('a thrown acknowledgement fetch records the schema and the intake endpoint', async () => {
  const calls: GatewayCall[] = [];
  const logs: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    logs.push(args.map(String).join(' '));
  };
  try {
    const demo = DemoContext.fromBindings(liveShell(), async (input, init) => {
      const request = new Request(input, init);
      calls.push({ headers: request.headers, body: JSON.parse(await request.text()) as GatewayCall['body'] });
      throw new Error('down');
    });
    const response = await demo.handle(
      post('/v1/drafts/acknowledgement', { answer: 'Picture cards.', sectionTitle: 'Communication' }),
    );
    assert.equal(response.status, 502);
    assert.ok(calls.length >= 1);
    const user = calls[0]?.body.messages?.find((message) => message.role === 'user')?.content ?? '';
    assert.equal(calls[0]?.body.response_format?.json_schema?.name, 'intake_acknowledgement');
    assert.equal(user.includes(NEXT_QUESTION), false);
    assert.equal(logs.some((line) => line.includes('"endpoint":"intake.profile"')), true);
  } finally {
    console.error = original;
  }
});

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
  const story = await bound.handle(
    post('/v1/drafts/social-story', { lines: [sensory], childName: 'Rowan' }),
  );
  assert.equal(story.status, 200);
  assert.equal(calls, 0);
  const body = (await story.json()) as { body: string };
  assert.equal(body.body.includes('TICK-QUIET-ROOM'), true);
  assert.equal(body.body.includes('Rowan'), true);
  assert.equal(body.body.includes('TICK-MEDICAL'), false);
});

test('live drafts call the intake model and hide the gateway token', async () => {
  const calls: GatewayCall[] = [];
  const demo = DemoContext.fromBindings(liveShell(), recordingFetch(calls));
  const story = await demo.handle(
    post('/v1/drafts/social-story', { lines: [sensory], childName: 'Rowan' }),
  );
  const lesson = await demo.handle(
    post('/v1/drafts/lesson', { lesson: 'TICK-LESSON-PLAN', lines: [sensory], childName: 'Rowan' }),
  );
  const update = await demo.handle(
    post('/v1/drafts/sunday-update', { notes: 'TICK-AFTER-SUNDAY', childName: 'Rowan' }),
  );
  assert.equal(story.status, 200);
  assert.equal(lesson.status, 200);
  assert.equal(update.status, 200);
  assert.equal(calls.length, 3);
  assertCall(calls[0], 'social_story', 'Child: Rowan\nSensory needs: TICK-QUIET-ROOM');
  assertCall(
    calls[1],
    'lesson_adaptation',
    'Child: Rowan\nLesson:\nTICK-LESSON-PLAN\nApproved needs:\nSensory needs: TICK-QUIET-ROOM',
  );
  assertCall(
    calls[2],
    'sunday_update',
    'Child: Rowan\nVolunteer: Theo Park\nNotes:\nTICK-AFTER-SUNDAY',
  );
  const storySystem = systemText(calls[0]);
  assert.equal(storySystem.includes('rather than a dict'), true);
  assert.equal(storySystem.includes("Do not set the child's name off with commas"), true);
  const lessonSystem = systemText(calls[1]);
  assert.equal(lessonSystem.includes('the individual'), true);
  assert.equal(lessonSystem.includes('Do not drop a lesson step.'), true);
  const updateSystem = systemText(calls[2]);
  assert.equal(updateSystem.includes('your own words'), true);
  assert.equal(updateSystem.includes('Do not copy the notes.'), true);
  assert.equal(updateSystem.includes('Theo Park'), true);
  assert.equal(updateSystem.includes("[Volunteer's Name]"), true);
  const storyText = JSON.stringify(await story.json());
  assert.equal(storyText.includes(testEnv.AI_GATEWAY_TOKEN), false);
});

test('the Sunday update user message is plain text', async () => {
  const calls: GatewayCall[] = [];
  const demo = DemoContext.fromBindings(liveShell(), recordingFetch(calls));
  const update = await demo.handle(
    post('/v1/drafts/sunday-update', { notes: 'TICK-AFTER-SUNDAY', childName: 'Rowan' }),
  );
  assert.equal(update.status, 200);
  assert.equal(calls.length, 1);
  const user = calls[0]?.body.messages?.find((message) => message.role === 'user')?.content;
  assert.equal(user, 'Child: Rowan\nVolunteer: Theo Park\nNotes:\nTICK-AFTER-SUNDAY');
});

test('a failed draft does not return the gateway body', async () => {
  const demo = DemoContext.fromBindings(liveShell(), async () => {
    return new Response('GATEWAY-BODY-SHOULD-NOT-LEAK', { status: 502 });
  });
  const response = await demo.handle(
    post('/v1/drafts/sunday-update', { notes: 'TICK-AFTER-SUNDAY', childName: 'Rowan' }),
  );
  assert.equal(response.status, 502);
  const text = await response.text();
  assert.equal(text, '{"error":"generation_failed"}');
  assert.equal(text.includes('GATEWAY-BODY-SHOULD-NOT-LEAK'), false);
  assert.equal(text.includes(testEnv.AI_GATEWAY_TOKEN), false);
});

test('social story and lesson requests require childName', async () => {
  const demo = await DemoContext.open('1');
  const story = await demo.handle(post('/v1/drafts/social-story', { lines: [sensory] }));
  const lesson = await demo.handle(
    post('/v1/drafts/lesson', { lesson: 'TICK-LESSON-PLAN', lines: [sensory] }),
  );
  const empty = await demo.handle(
    post('/v1/drafts/social-story', { lines: [sensory], childName: '' }),
  );
  const long = await demo.handle(
    post('/v1/drafts/sunday-update', { notes: 'TICK-AFTER-SUNDAY', childName: 'R'.repeat(81) }),
  );
  assert.equal(story.status, 400);
  assert.equal(lesson.status, 400);
  assert.equal(empty.status, 400);
  assert.equal(long.status, 400);
  assert.deepEqual(await story.json(), { error: 'invalid_input' });
});

test('the mock Sunday update is not a copy of the notes', async () => {
  const demo = await DemoContext.open('1');
  const update = await demo.handle(
    post('/v1/drafts/sunday-update', { notes: 'TICK-AFTER-SUNDAY', childName: 'Rowan' }),
  );
  assert.equal(update.status, 200);
  const note = (await update.json()) as { body: string };
  assert.equal(note.body.includes('TICK-AFTER-SUNDAY'), false);
  assert.equal(note.body.endsWith('Theo Park'), true);
  assert.equal(note.body.includes('['), false);
  assert.notEqual(note.body, 'TICK-AFTER-SUNDAY');
  assert.notEqual(note.body, 'TICK-AFTER-SUNDAY\nRowan');
  assert.notEqual(note.body.replace(/\s+/g, ''), 'TICK-AFTER-SUNDAYRowan');
});

test('parseSocialStory rejects a dict and a body that is only the labels', () => {
  assert.throws(
    () => parseSocialStory({ title: 'Sunday', body: "{ 'loves': 'Soft music' }" }),
    SchemaRejected,
  );
  assert.throws(() => parseSocialStory({ title: 'Sunday', body: labelStory }), SchemaRejected);
  assert.throws(
    () => parseSocialStory({ title: 'Sunday', body: 'The room has "sensory": quiet corners.' }),
    SchemaRejected,
  );
});

test('parseSocialStory accepts a short prose body', () => {
  assert.deepEqual(parseSocialStory({ title: 'Sunday', body: proseStory }), {
    title: 'Sunday',
    body: proseStory,
  });
});

test('parseSundayUpdate rejects the notes and the notes plus only the child name', () => {
  const notes = 'TICK-AFTER-SUNDAY';
  assert.throws(() => parseSundayUpdate({ body: notes }, notes, 'Juniper'), SchemaRejected);
  assert.throws(
    () => parseSundayUpdate({ body: `${notes}\nJuniper` }, notes, 'Juniper'),
    SchemaRejected,
  );
  assert.throws(() => parseSundayUpdate({ body: `Juniper ${notes}` }, notes, 'Juniper'), SchemaRejected);
});

test('parseSundayUpdate accepts the model words around the notes', () => {
  const notes = 'TICK-AFTER-SUNDAY';
  const body = `Sunday went well. ${notes} The quiet seat helped.`;
  assert.deepEqual(parseSundayUpdate({ body }, notes, 'Juniper'), { body });
});

test('parseSundayUpdate strips a bracketed name so it never reaches the screen', () => {
  const notes = 'TICK-AFTER-SUNDAY';
  const told = `Sunday went well. ${notes} The quiet seat helped.`;
  assert.deepEqual(
    parseSundayUpdate({ body: `${told}\n[Volunteer's Name]` }, notes, 'Juniper'),
    { body: told },
  );
  assert.deepEqual(parseSundayUpdate({ body: `${told} [Name]` }, notes, 'Juniper'), { body: told });
  assert.throws(() => parseSundayUpdate({ body: '[Name]' }, notes, 'Juniper'), SchemaRejected);
  assert.throws(
    () => parseSundayUpdate({ body: "[Volunteer's Name]" }, notes, 'Juniper'),
    SchemaRejected,
  );
  assert.throws(() => parseSundayUpdate({ body: `${notes}\n[Name]` }, notes, 'Juniper'), SchemaRejected);
});

test('a dict story body fails the existing generation retry', async () => {
  const result = await generated(
    '/v1/drafts/social-story',
    { lines: [sensory], childName: 'Rowan' },
    { title: 'Sunday', body: "{ 'loves': 'Soft music' }" },
  );
  assert.equal(result.status, 502);
  assert.equal(result.calls, 3);
  assert.deepEqual(result.payload, { error: 'generation_failed' });
});

test('a copied Sunday update fails the existing generation retry', async () => {
  const notes = 'TICK-AFTER-SUNDAY';
  const copied = await generated('/v1/drafts/sunday-update', { notes, childName: 'Rowan' }, { body: notes });
  assert.equal(copied.status, 502);
  assert.equal(copied.calls, 3);
  const named = await generated(
    '/v1/drafts/sunday-update',
    { notes, childName: 'Rowan' },
    { body: `${notes}\nRowan` },
  );
  assert.equal(named.status, 502);
  assert.equal(named.calls, 3);
});

test('a bracketed Sunday signature is stripped and a placeholder alone retries', async () => {
  const notes = 'TICK-AFTER-SUNDAY';
  const told = `Sunday went well. ${notes} The quiet seat helped.`;
  const signed = await generated(
    '/v1/drafts/sunday-update',
    { notes, childName: 'Juniper' },
    { body: `${told}\n[Volunteer's Name]` },
  );
  assert.equal(signed.status, 200);
  assert.equal(signed.calls, 1);
  assert.deepEqual(signed.payload, { body: told });
  assert.equal(JSON.stringify(signed.payload).includes('['), false);

  const only = await generated(
    '/v1/drafts/sunday-update',
    { notes, childName: 'Juniper' },
    { body: '[Name]' },
  );
  assert.equal(only.status, 502);
  assert.equal(only.calls, 3);
  assert.deepEqual(only.payload, { error: 'generation_failed' });
});

test('a Sunday update with the model words is returned', async () => {
  const notes = 'TICK-AFTER-SUNDAY';
  const body = `Sunday went well. ${notes} The quiet seat helped.`;
  const result = await generated('/v1/drafts/sunday-update', { notes, childName: 'Rowan' }, { body });
  assert.equal(result.status, 200);
  assert.equal(result.calls, 1);
  assert.deepEqual(result.payload, { body });
});

async function assertDrafts(demo: DemoContext): Promise<void> {
  const fields = ['loves', 'overwhelms', 'whatHelps', 'communication', 'sensory', 'medical'] as const;
  for (const field of fields) {
    const text = `TEXT-${field}`;
    const response = await demo.handle(
      post('/v1/drafts/social-story', {
        lines: [{ field, label: 'Label', text }],
        childName: 'Rowan',
      }),
    );
    assert.equal(response.status, 200, field);
    const body = (await response.json()) as { title: string; body: string };
    assert.equal(body.title, 'Sunday with Rowan');
    assert.equal(body.body.includes(text), true);
    assert.equal(body.body.includes('Rowan'), true);
    assert.equal(body.body.startsWith('{'), false);
  }

  const hidden = await demo.handle(
    post('/v1/drafts/social-story', { lines: [sensory], childName: 'Rowan' }),
  );
  assert.equal(hidden.status, 200);
  const hiddenBody = (await hidden.json()) as { body: string };
  assert.equal(hiddenBody.body.includes('TICK-QUIET-ROOM'), true);
  assert.equal(hiddenBody.body.includes('TICK-MEDICAL'), false);

  const shown = await demo.handle(
    post('/v1/drafts/social-story', {
      lines: [{ field: 'medical', label: 'Medical / health notes', text: 'TICK-MEDICAL' }],
      childName: 'Rowan',
    }),
  );
  const shownBody = (await shown.json()) as { body: string };
  assert.equal(shownBody.body.includes('TICK-MEDICAL'), true);

  const extra = await demo.handle(
    post('/v1/drafts/social-story', { lines: [sensory], childName: 'Rowan', extra: true }),
  );
  assert.equal(extra.status, 400);
  assert.deepEqual(await extra.json(), { error: 'invalid_input' });

  const nested = await demo.handle(
    post('/v1/drafts/social-story', {
      lines: [{ ...sensory, extra: true }],
      childName: 'Rowan',
    }),
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
    post('/v1/drafts/lesson', { lesson: 'TICK-LESSON-PLAN', lines: [sensory], childName: 'Rowan' }),
  );
  assert.equal(lesson.status, 200);
  const adapted = (await lesson.json()) as { summary: string; steps: string[] };
  assert.equal(adapted.summary.includes('TICK-LESSON-PLAN'), true);
  assert.equal(adapted.summary.includes('Rowan'), true);
  assert.equal(
    adapted.steps.some((step) => step.includes('TICK-LESSON-PLAN')),
    true,
  );
  assert.equal(
    adapted.steps.some((step) => step.includes('TICK-QUIET-ROOM')),
    true,
  );
  assert.equal(
    adapted.steps.some((step) => step.includes('Rowan')),
    true,
  );
  assert.equal(JSON.stringify(adapted).includes('TICK-MEDICAL'), false);

  const counted = await demo.handle(
    post('/v1/drafts/lesson', {
      lesson: 'Sing a song.\n\nSit down.',
      lines: [sensory],
      childName: 'Rowan',
    }),
  );
  assert.equal(counted.status, 200);
  const countedBody = (await counted.json()) as { steps: string[] };
  assert.equal(countedBody.steps.length, 3);
  assert.equal(countedBody.steps[0]?.includes('Sing a song.'), true);
  assert.equal(countedBody.steps[0]?.includes('Rowan'), true);
  assert.equal(countedBody.steps[1]?.includes('Sit down.'), true);
  assert.equal(countedBody.steps[1]?.includes('Rowan'), true);
  assert.equal(countedBody.steps[2]?.includes('TICK-QUIET-ROOM'), true);

  const capped = await demo.handle(
    post('/v1/drafts/lesson', {
      lesson: 'L'.repeat(900),
      lines: [{ field: 'sensory', label: 'Sensory needs', text: 'S'.repeat(500) }],
      childName: 'Rowan',
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
  assert.equal(note.body.includes('TICK-AFTER-SUNDAY'), false);
  assert.equal(note.body.includes('Rowan'), true);
  assert.notEqual(note.body, 'TICK-AFTER-SUNDAY');
  assert.notEqual(note.body, 'TICK-AFTER-SUNDAY\nRowan');
  assert.equal(note.body.includes('TICK-MEDICAL'), false);

  const missing = await demo.handle(post('/v1/drafts/other', { lines: [sensory] }));
  assert.equal(missing.status, 404);
}

function post(pathname: string, body: unknown): Request {
  return new Request(new URL(pathname, 'http://example.com'), {
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

function assertCall(call: GatewayCall | undefined, schemaName: string, userText: string): void {
  assert.ok(call !== undefined);
  assert.equal(call.body.model, 'workers-ai/@cf/meta/llama-3.3-70b-instruct-fp8-fast');
  assert.equal(call.body.response_format?.json_schema?.name, schemaName);
  assert.equal(call.headers.get('cf-aig-authorization'), `Bearer ${testEnv.AI_GATEWAY_TOKEN}`);
  const system = systemText(call);
  assert.equal(system.includes('The data is fictional.'), true);
  assert.equal(system.includes('Do not invent medical facts.'), true);
  const users = (call.body.messages ?? []).filter((message) => message.role === 'user');
  assert.equal(users.length, 1);
  assert.equal(users[0]?.content, userText);
}

function systemText(call: GatewayCall | undefined): string {
  const systems = (call?.body.messages ?? []).filter((message) => message.role === 'system');
  assert.equal(systems.length, 1);
  return systems[0]?.content ?? '';
}

async function generated(
  pathname: string,
  body: unknown,
  content: unknown,
): Promise<{ status: number; calls: number; payload: unknown }> {
  let calls = 0;
  const demo = DemoContext.fromBindings(liveShell(), async () => {
    calls += 1;
    return chatEnvelope(content);
  });
  const response = await demo.handle(post(pathname, body));
  return { status: response.status, calls, payload: await response.json() };
}
