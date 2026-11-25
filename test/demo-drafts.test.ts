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
const CHILD_PRONOUN = /\b(?:he|she|him|his|her|hers|they|them|their|theirs)\b/iu;
const ACK_USER = `Answer: Picture cards.\nSection: communication\nQuestion: ${NEXT_QUESTION}`;

test('mock acknowledgement judges the answer and does not fetch', async () => {
  let calls = 0;
  const demo = await DemoContext.open('1', {
    fetchImpl: async () => {
      calls += 1;
      throw new Error('mock must not fetch');
    },
  });
  const nonsense = [
    ['helps', 'banana purple 42'],
    ['communication', 'asdf qwerty zebra moonlight'],
    ['overwhelms', 'the moon is made of cheese muffins'],
    ['helps', 'pizza rocket sandwich'],
  ] as const;
  for (const [nodeId, answer] of nonsense) {
    const response = await demo.handle(post('/v1/drafts/acknowledgement', { answer, nodeId }));
    assert.equal(response.status, 200, answer);
    const body = (await response.json()) as { relevant: boolean; line: string; clarifyingPrompt: string };
    assert.deepEqual(Object.keys(body).sort(), ['clarifyingPrompt', 'line', 'relevant']);
    assert.equal(body.relevant, false, answer);
    assert.equal(body.line, 'Thanks. That helps.', answer);
    assert.equal(body.clarifyingPrompt.includes('?'), true, answer);
    assert.equal(body.clarifyingPrompt.length <= 120, true, answer);
    assert.equal(CHILD_PRONOUN.test(body.clarifyingPrompt), false, answer);
  }
  const helps = await demo.handle(
    post('/v1/drafts/acknowledgement', { answer: 'banana purple 42', nodeId: 'helps' }),
  );
  assert.equal(
    ((await helps.json()) as { clarifyingPrompt: string }).clarifyingPrompt,
    'I want to make sure I understand. What usually helps Rowan settle when things feel like too much?',
  );
  const sensible = [
    ['about', 'He likes a quiet hello.'],
    ['loves', 'Trains.'],
    ['overwhelms', 'Crowded doorways.'],
    ['helps', 'A quiet corner and a heads-up before the next song.'],
    ['communication', 'Picture cards.'],
    ['sensory', 'TICK-QUIET-ROOM'],
    ['toileting', 'Tells an adult'],
    ['allergies', 'Food allergy'],
    ['allergies-more', 'TICK-ALLERGY-PLAN'],
    ['behavior', 'No, not usually'],
    ['loves', 'Painted rocks'],
    ['sensory', 'TICK-SOFTER-SEAT'],
    ['helps', 'not sure'],
    ['helps', 'nothing special'],
    ['loves', 'A pizza sandwich'],
    ['loves', 'Cheese sandwich'],
    ['loves', 'A ham sandwich and pizza'],
    ['loves', 'Trains, banana, and purple'],
    ['helps', 'A quiet corner and a cheese muffin'],
    ['allergies', 'Allergic to pizza and cheese'],
  ] as const;
  for (const [nodeId, answer] of sensible) {
    const response = await demo.handle(post('/v1/drafts/acknowledgement', { answer, nodeId }));
    assert.equal(response.status, 200, answer);
    assert.deepEqual(await response.json(), {
      relevant: true,
      line: 'Thanks. That helps.',
      clarifyingPrompt: '',
    });
  }
  const medical = await demo.handle(
    post('/v1/drafts/acknowledgement', { answer: 'Peanuts.', sectionId: 'medical' }),
  );
  assert.equal(medical.status, 400);
  assert.equal(calls, 0);
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
      return chatEnvelope({ relevant: true, line: 'Thanks for telling me.', clarifyingPrompt: '' });
    });
    const response = await demo.handle(
      post('/v1/drafts/acknowledgement', { answer: 'Picture cards.', nodeId: 'communication' }),
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      relevant: true,
      line: 'Thanks for telling me.',
      clarifyingPrompt: '',
    });
    const user = calls[0]?.body.messages?.find((message) => message.role === 'user')?.content ?? '';
    assert.equal(calls[0]?.body.response_format?.json_schema?.name, 'intake_acknowledgement');
    assert.equal(calls[0]?.body.max_tokens, 80);
    assert.equal(calls[0]?.body.model, 'workers-ai/@cf/meta/llama-3.3-70b-instruct-fp8-fast');
    assert.equal(user.includes('Picture cards.'), true);
    assert.equal(user.includes('communication'), true);
    assert.equal(user, ACK_USER);
    assert.equal(logs.some((line) => line.includes('"endpoint":"intake.profile"')), true);
    assert.equal(logs.some((line) => line.includes('Picture cards.')), false);
  } finally {
    console.log = original;
  }
});

test('an acknowledgement longer than 500 characters is rejected before fetch', async () => {
  const result = await rejectedAcknowledgement({ answer: 'a'.repeat(501), nodeId: 'communication' });
  assert.equal(result.status, 400);
  assert.equal(result.calls, 0);
});

test('an unknown acknowledgement node is rejected before fetch', async () => {
  const result = await rejectedAcknowledgement({ answer: 'Picture cards.', nodeId: 'nope' });
  assert.equal(result.status, 400);
  assert.equal(result.calls, 0);
});

test('an acknowledgement with an extra key is rejected before fetch', async () => {
  const result = await rejectedAcknowledgement({
    answer: 'Picture cards.',
    nodeId: 'communication',
    prompt: 'Write the next question.',
  });
  assert.equal(result.status, 400);
  assert.equal(result.calls, 0);
});

test('an acknowledgement with a newline comes back as one line', async () => {
  const demo = DemoContext.fromBindings(liveShell(), async () =>
    chatEnvelope({ relevant: true, line: 'Thanks.\nThat helps.', clarifyingPrompt: '' }),
  );
  const response = await demo.handle(
    post('/v1/drafts/acknowledgement', { answer: 'Picture cards.', nodeId: 'communication' }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    relevant: true,
    line: 'Thanks. That helps.',
    clarifyingPrompt: '',
  });
});

const PARENT_FALLBACK = "That's really helpful.";

const ACKNOWLEDGEMENT_PROMPT = [
  "Ready helps parents of children who need extra support prepare a church kids' ministry, its volunteers and leaders, for Sunday.",
  'Each answer should tell those volunteers something about this child relevant to the asked question.',
  'The data is fictional. Do not invent medical facts.',
  'Return relevant, line, and clarifyingPrompt.',
  'line is one warm, plain thank-you to the parent, in 15 words or fewer, as one sentence.',
  'Do not restate or quote the answer.',
  'Do not generalise about individuals.',
  'Never mention a condition, diagnosis, or disability.',
  'Do not label the child.',
  'Do not use a pronoun for the child in line or clarifyingPrompt.',
  "Use the child's name only if the answer includes it.",
  'line must not ask a question and must not preview another question.',
  'Set relevant to true only when the answer addresses the asked question.',
  'Random, unrelated, joke, or keyboard-mash words are not relevant, even when they are real words.',
  'An answer that addresses the question is relevant even when it is short, messy, or misspelled, including "I don\'t know", "not sure", and "nothing special".',
  'When relevant is false, clarifyingPrompt is one short follow-up question.',
  'When relevant is true, clarifyingPrompt is an empty string.',
  'Relevant: "A quiet corner." for "What helps Rowan feel calm again when things get to be too much?"',
  'Relevant: "not sure" for "What helps Rowan feel calm again when things get to be too much?"',
  'Not relevant: "pizza rocket sandwich" for "What helps Rowan feel calm again when things get to be too much?"',
  'Not relevant: "asdf qwerty" for "What helps Rowan feel calm again when things get to be too much?"',
  'Examples of line:',
  "Thank you, that's really useful to know.",
  'Got it, that will help the volunteers.',
  'Thanks, that gives us a clearer picture.',
  "That's really helpful.",
].join('\n');

test('a good acknowledgement is returned unchanged', async () => {
  const line = "Thank you, that's really useful to know.";
  const result = await acknowledgementFrom(line);
  assert.equal(result.status, 200);
  assert.equal(result.calls, 1);
  assert.equal(result.maxTokens, 80);
  assert.equal(result.system, ACKNOWLEDGEMENT_PROMPT);
  assert.equal(result.user, ACK_USER);
  assert.deepEqual(result.body, { relevant: true, line, clarifyingPrompt: '' });
});

test('an acknowledgement of 120 characters is returned unchanged', async () => {
  const line = `${'a'.repeat(119)}.`;
  assert.equal(line.length, 120);
  const result = await acknowledgementFrom(line);
  assert.equal(result.status, 200);
  assert.equal(result.calls, 1);
  assert.deepEqual(result.body, { relevant: true, line, clarifyingPrompt: '' });
});

test('a cut-off acknowledgement falls back', async () => {
  const result = await acknowledgementFrom('Thank you for telling me tha');
  assert.equal(result.status, 200);
  assert.equal(result.calls, 1);
  assert.deepEqual(result.body, { relevant: true, line: PARENT_FALLBACK, clarifyingPrompt: '' });
});

test('an acknowledgement with a non-Latin character falls back', async () => {
  const result = await acknowledgementFrom('Thank you, that helps噪.');
  assert.equal(result.status, 200);
  assert.equal(result.calls, 1);
  assert.deepEqual(result.body, { relevant: true, line: PARENT_FALLBACK, clarifyingPrompt: '' });
});

test('an acknowledgement that names a diagnosis falls back', async () => {
  for (const word of ['autism', 'Aphasia', 'diagnosis', 'disorder', 'disability', 'impairment', 'individuals']) {
    const result = await acknowledgementFrom(`Thank you for the note on ${word}.`);
    assert.equal(result.status, 200, word);
    assert.equal(result.calls, 1, word);
    assert.deepEqual(result.body, { relevant: true, line: PARENT_FALLBACK, clarifyingPrompt: '' }, word);
  }
});

test('an acknowledgement longer than 120 characters falls back', async () => {
  const line = `${'a'.repeat(120)}.`;
  assert.equal(line.length, 121);
  const result = await acknowledgementFrom(line);
  assert.equal(result.status, 200);
  assert.equal(result.calls, 1);
  assert.deepEqual(result.body, { relevant: true, line: PARENT_FALLBACK, clarifyingPrompt: '' });
});

test('an acknowledgement with a question mark falls back', async () => {
  const result = await acknowledgementFrom('Really? That helps.');
  assert.equal(result.status, 200);
  assert.equal(result.calls, 1);
  assert.deepEqual(result.body, { relevant: true, line: PARENT_FALLBACK, clarifyingPrompt: '' });
});

test('an acknowledgement that uses a child pronoun falls back', async () => {
  for (const line of ['She loves trains.', 'He likes a quiet hello.', 'They love trains.']) {
    const result = await acknowledgementFrom(line);
    assert.equal(result.status, 200, line);
    assert.equal(result.calls, 1, line);
    assert.deepEqual(result.body, { relevant: true, line: PARENT_FALLBACK, clarifyingPrompt: '' }, line);
  }
});

test('an acknowledgement that repeats the answer falls back', async () => {
  const line = 'Quiet mornings work best.';
  const result = await acknowledgementFrom(line, line);
  assert.equal(result.status, 200);
  assert.equal(result.calls, 1);
  assert.deepEqual(result.body, { relevant: true, line: PARENT_FALLBACK, clarifyingPrompt: '' });
});

test('a live off-topic answer keeps the model not-relevant verdict', async () => {
  const prompt = 'I want to make sure I understand. What does that have to do with Sunday?';
  const demo = DemoContext.fromBindings(liveShell(), async () =>
    chatEnvelope({ relevant: false, line: 'Thanks. That helps.', clarifyingPrompt: prompt }),
  );
  const response = await demo.handle(
    post('/v1/drafts/acknowledgement', { answer: 'pizza rocket sandwich', nodeId: 'helps' }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    relevant: false,
    line: 'Thanks. That helps.',
    clarifyingPrompt: prompt,
  });
});

test('a live care answer overrides a model not-relevant verdict', async () => {
  const demo = DemoContext.fromBindings(liveShell(), async () =>
    chatEnvelope({
      relevant: false,
      line: 'Thanks. That helps.',
      clarifyingPrompt: 'I want to make sure I understand. What does that have to do with Sunday?',
    }),
  );
  const response = await demo.handle(
    post('/v1/drafts/acknowledgement', { answer: 'A quiet corner', nodeId: 'helps' }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    relevant: true,
    line: 'Thanks. That helps.',
    clarifyingPrompt: '',
  });
});

test('a live quiet corner and cheese muffin answer overrides a model not-relevant verdict', async () => {
  const demo = DemoContext.fromBindings(liveShell(), async () =>
    chatEnvelope({
      relevant: false,
      line: 'Thanks. That helps.',
      clarifyingPrompt: 'I want to make sure I understand. What does that have to do with Sunday?',
    }),
  );
  const response = await demo.handle(
    post('/v1/drafts/acknowledgement', {
      answer: 'A quiet corner and a cheese muffin',
      nodeId: 'helps',
    }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    relevant: true,
    line: 'Thanks. That helps.',
    clarifyingPrompt: '',
  });
});

test('short uncertain or no answers override a model not-relevant verdict', async () => {
  const demo = DemoContext.fromBindings(liveShell(), async () =>
    chatEnvelope({
      relevant: false,
      line: 'Thanks. That helps.',
      clarifyingPrompt: 'I want to make sure I understand. What does that have to do with Sunday?',
    }),
  );
  const cases = [
    ['behavior', 'no, not really'],
    ['allergies', 'not sure'],
    ['behavior', 'unsure'],
    ['behavior', 'i dont know'],
    ['behavior', 'idk'],
    ['behavior', 'dont know yet'],
    ['behavior', 'none'],
    ['behavior', 'no'],
    ['behavior', 'nope'],
    ['behavior', 'not really'],
    ['behavior', 'no not really'],
    ['behavior', 'nothing'],
    ['behavior', 'nothing special'],
    ['behavior', 'n a'],
    ['behavior', 'not that i know of'],
    ['allergies', 'NOT SURE!'],
    ['behavior', 'No, not really.'],
    ['allergies', 'N/A'],
    ['behavior', "I don't know"],
  ] as const;
  for (const [nodeId, answer] of cases) {
    const response = await demo.handle(post('/v1/drafts/acknowledgement', { answer, nodeId }));
    assert.equal(response.status, 200, answer);
    assert.deepEqual(
      await response.json(),
      { relevant: true, line: 'Thanks. That helps.', clarifyingPrompt: '' },
      answer,
    );
  }
});

test('lol idk pizza stays not relevant and keeps an unlabeled clarifying prompt', async () => {
  const clarifyingPrompt = 'I want to make sure I understand. What does that have to do with Sunday?';
  const demo = DemoContext.fromBindings(liveShell(), async () =>
    chatEnvelope({ relevant: false, line: 'Thanks. That helps.', clarifyingPrompt }),
  );
  const response = await demo.handle(
    post('/v1/drafts/acknowledgement', { answer: 'lol idk pizza', nodeId: 'helps' }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    relevant: false,
    line: 'Thanks. That helps.',
    clarifyingPrompt,
  });
});

test('a labeled clarifying prompt falls back to the canned helps question', async () => {
  const canned =
    'I want to make sure I understand. What usually helps Rowan settle when things feel like too much?';
  const prompts = [
    'Does Rowan have any special needs?',
    'Any special-needs on Sunday?',
    'Anything unique or special?',
    'What sensory needs should a volunteer know?',
  ];
  for (const clarifyingPrompt of prompts) {
    const demo = DemoContext.fromBindings(liveShell(), async () =>
      chatEnvelope({ relevant: false, line: 'Thanks. That helps.', clarifyingPrompt }),
    );
    const response = await demo.handle(
      post('/v1/drafts/acknowledgement', { answer: 'pizza rocket sandwich', nodeId: 'helps' }),
    );
    assert.equal(response.status, 200, clarifyingPrompt);
    assert.deepEqual(
      await response.json(),
      { relevant: false, line: 'Thanks. That helps.', clarifyingPrompt: canned },
      clarifyingPrompt,
    );
  }
});

test('a clarifying prompt that says especially or needed is kept', async () => {
  const prompts = [
    'What usually helps Rowan, especially on a loud Sunday?',
    'What is needed when Sunday feels like too much?',
  ];
  for (const clarifyingPrompt of prompts) {
    const demo = DemoContext.fromBindings(liveShell(), async () =>
      chatEnvelope({ relevant: false, line: 'Thanks. That helps.', clarifyingPrompt }),
    );
    const response = await demo.handle(
      post('/v1/drafts/acknowledgement', { answer: 'pizza rocket sandwich', nodeId: 'helps' }),
    );
    assert.equal(response.status, 200, clarifyingPrompt);
    assert.deepEqual(await response.json(), {
      relevant: false,
      line: 'Thanks. That helps.',
      clarifyingPrompt,
    });
  }
});

test('a live answer with a number keeps the model relevant verdict', async () => {
  const demo = DemoContext.fromBindings(liveShell(), async () =>
    chatEnvelope({ relevant: true, line: 'Thanks. That helps.', clarifyingPrompt: '' }),
  );
  const response = await demo.handle(
    post('/v1/drafts/acknowledgement', { answer: 'Gets 2 breaks', nodeId: 'helps' }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    relevant: true,
    line: 'Thanks. That helps.',
    clarifyingPrompt: '',
  });
});

test('a live acknowledgement asks for eighty tokens and leaves the next question out', async () => {
  const calls: GatewayCall[] = [];
  const logs: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(' '));
  };
  const planted = 'What should we ask after this planted sentence?';
  try {
    const demo = DemoContext.fromBindings(liveShell(), async (input, init) => {
      const request = new Request(input, init);
      calls.push({ headers: request.headers, body: JSON.parse(await request.text()) as GatewayCall['body'] });
      return chatEnvelope({ relevant: true, line: 'Thanks. That helps.', clarifyingPrompt: '' });
    });
    const response = await demo.handle(
      post('/v1/drafts/acknowledgement', { answer: 'Picture cards.', nodeId: 'communication' }),
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      relevant: true,
      line: 'Thanks. That helps.',
      clarifyingPrompt: '',
    });
    const call = calls[0];
    const user = call?.body.messages?.find((message) => message.role === 'user')?.content ?? '';
    assert.equal(call?.body.max_tokens, 80);
    assert.equal(call?.body.response_format?.json_schema?.name, 'intake_acknowledgement');
    assert.equal(call?.headers.get('cf-aig-collect-log-payload'), 'false');
    assert.equal(user.includes('Picture cards.'), true);
    assert.equal(user.includes('communication'), true);
    assert.equal(user.includes(planted), false);
    assert.equal(user, ACK_USER);
    assert.equal(logs.some((line) => line.includes('"endpoint":"intake.profile"')), true);
    assert.equal(logs.some((line) => line.includes('Picture cards.')), false);
    const safe = logs
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .find((entry) => entry.endpoint === 'intake.profile');
    assert.deepEqual(Object.keys(safe ?? {}).sort(), [
      'attempt',
      'endpoint',
      'model',
      'outcome',
      'phase',
      'provider',
    ]);
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
      post('/v1/drafts/acknowledgement', { answer: 'Picture cards.', nodeId: 'communication' }),
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      relevant: true,
      line: "That's really helpful.",
      clarifyingPrompt: '',
    });
    assert.ok(calls.length >= 1);
    const user = calls[0]?.body.messages?.find((message) => message.role === 'user')?.content ?? '';
    assert.equal(calls[0]?.body.response_format?.json_schema?.name, 'intake_acknowledgement');
    assert.equal(user, ACK_USER);
    assert.equal(logs.some((line) => line.includes('"endpoint":"intake.profile"')), true);
    assert.equal(logs.some((line) => line.includes('Picture cards.')), false);
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
    max_tokens?: number;
    messages?: { role?: string; content?: string }[];
    response_format?: { json_schema?: { name?: string } };
  };
}

async function acknowledgementFrom(line: string, answer = 'Picture cards.'): Promise<{
  status: number;
  calls: number;
  body: unknown;
  system: string;
  user: string;
  maxTokens: number | undefined;
}> {
  const calls: GatewayCall[] = [];
  const original = console.log;
  console.log = () => {};
  try {
    const demo = DemoContext.fromBindings(liveShell(), async (input, init) => {
      const request = new Request(input, init);
      calls.push({ headers: request.headers, body: JSON.parse(await request.text()) as GatewayCall['body'] });
      return chatEnvelope({ relevant: true, line, clarifyingPrompt: '' });
    });
    const response = await demo.handle(
      post('/v1/drafts/acknowledgement', { answer, nodeId: 'communication' }),
    );
    const call = calls[0];
    return {
      status: response.status,
      calls: calls.length,
      body: await response.json(),
      system: call?.body.messages?.find((message) => message.role === 'system')?.content ?? '',
      user: call?.body.messages?.find((message) => message.role === 'user')?.content ?? '',
      maxTokens: call?.body.max_tokens,
    };
  } finally {
    console.log = original;
  }
}

async function rejectedAcknowledgement(body: unknown): Promise<{ status: number; calls: number }> {
  let calls = 0;
  const demo = DemoContext.fromBindings(liveShell(), async () => {
    calls += 1;
    return chatEnvelope({ line: 'Thanks. That helps.' });
  });
  const response = await demo.handle(post('/v1/drafts/acknowledgement', body));
  return { status: response.status, calls };
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
