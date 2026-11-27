import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DemoContext } from '../scripts/demo-engine.ts';
import {
  fallbackSocialStory,
  parseSocialStory,
  parseSocialStoryRequest,
  parseSundayUpdate,
  socialStoryMessages,
  storySafety,
} from '../src/demo-drafts.ts';
import { SchemaRejected } from '../src/errors.ts';
import { SUNDAY_STORY_BODY_MAX, sundayFallbackSentences } from '../src/sunday-story-text.ts';
import { chatEnvelope, testEnv } from './fixtures.ts';

interface DraftLine {
  field: string;
  label: string;
  text: string;
}

const sensory: DraftLine = { field: 'sensory', label: 'Sensory needs', text: 'TICK-QUIET-ROOM' };
const harbor = {
  name: 'Example Harbor Fellowship',
  service: 'Sunday 9:30',
  room: 'Harbor Room',
  leader: 'Ms. Dana',
  plan: 'A short welcome, one song, and a quiet activity.',
};
const LEADER_SIGN = '\n\nMs. Dana\nExample Harbor Fellowship';

function sunday(notes: string, childName = 'Rowan', extra: Record<string, unknown> = {}) {
  return { notes, childName, leader: 'Ms. Dana', church: 'Example Harbor Fellowship', ...extra };
}
const safeBody =
  'On Sunday, Rowan goes to Example Harbor Fellowship. Rowan walks to Harbor Room. Ms. Dana says hello.';
const rowanLines = [
  { text: 'Rowan loves Disney stories and quiet songs.' },
  { text: 'A crowded doorway overwhelms Rowan.' },
  { text: 'A quiet break helps Rowan settle.' },
  { text: 'Rowan points and uses a few words.' },
  { text: 'Rowan needs a softer seat away from bright lights.' },
  { text: 'Rowan tells an adult when he needs the bathroom.' },
  { text: 'Rowan does not usually hurt himself or run off.' },
];
const rowanInput = { childName: 'Rowan', church: harbor, lines: rowanLines };
const mayaLines = [
  { text: 'Maya loves dinosaurs and digging in the sand table.' },
  { text: 'Sudden loud songs overwhelm Maya.' },
  { text: 'A warning before a change helps Maya.' },
  { text: 'Maya tells an adult with short sentences.' },
  { text: 'Maya prefers a dim corner when the room is loud.' },
  { text: 'Maya tells an adult and needs a reminder at transitions.' },
  { text: 'Maya sometimes needs a quiet lap and does not run off.' },
];
const jonahLines = [
  { text: 'Jonah loves Lego and building on the floor.' },
  { text: 'A rushed transition overwhelms Jonah.' },
  { text: 'A picture of the next activity helps Jonah.' },
  { text: 'Jonah uses picture cards.' },
  { text: 'Jonah likes a firm seat and a predictable sound level.' },
  { text: 'Jonah uses a sign or picture when he needs the bathroom.' },
  { text: 'Jonah stays with the group when an adult shows him a calm card.' },
];
const mayaInput = { childName: 'Maya', church: harbor, lines: mayaLines };
const jonahInput = { childName: 'Jonah', church: harbor, lines: jonahLines };
const fallbackBody = [
  'On Sunday at 9:30, you and your grown-up go to Example Harbor Fellowship.',
  'You walk in the front doors, and a greeter smiles and says hello.',
  'You go to the Harbor Room. You will have a short welcome, one song, and a quiet activity.',
  'Ms. Dana and the helpers are there to help you.',
  'If you need a break, there is a quiet spot in the room.',
  'When it is over, your grown-up comes back for you.',
  'Ms. Dana is glad you came.',
].join('\n\n');
const labelStory =
  'Loves. Overwhelms. What helps. Communication. Sensory needs. Medical / health notes.';

const NEXT_QUESTION = 'How does {child} usually let you know what {child} needs?';
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

test('a failing acknowledgement tries the gateway once and uses the fallback line', async () => {
  let calls = 0;
  const demo = DemoContext.fromBindings(liveShell(), async () => {
    calls += 1;
    return new Response('rate', { status: 429, headers: { 'retry-after': '2' } });
  });
  const response = await demo.handle(
    post('/v1/drafts/acknowledgement', { answer: 'Picture cards.', nodeId: 'communication' }),
  );
  assert.equal(response.status, 200);
  assert.equal(calls, 1);
  const body = (await response.json()) as { line: string };
  assert.equal(body.line, "That's really helpful.");
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

test('mock drafts stay on the church story and ignore fetch', async () => {
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
  const story = await bound.handle(socialStory({ lines: [sensory], childName: 'Rowan' }));
  assert.equal(story.status, 200);
  assert.equal(calls, 0);
  const body = (await story.json()) as { title: string; body: string };
  assert.equal(body.title, 'Sunday with Rowan');
  assert.equal(body.body.includes('TICK-QUIET-ROOM'), false);
  assert.equal(body.body.includes('TICK-MEDICAL'), false);
  assert.equal(body.body.includes(harbor.name), true);
  assert.equal(body.body.includes(harbor.room), true);
  assert.equal(body.body.includes(harbor.leader), true);
  assert.equal(
    storySafety(body, { childName: 'Rowan', church: harbor, lines: [{ text: sensory.text }] }),
    true,
  );
});

test('live drafts call the intake model and hide the gateway token', async () => {
  const calls: GatewayCall[] = [];
  const demo = DemoContext.fromBindings(liveShell(), recordingFetch(calls));
  const story = await demo.handle(socialStory({ lines: [sensory], childName: 'Rowan' }));
  const update = await demo.handle(post('/v1/drafts/sunday-update', sunday('TICK-AFTER-SUNDAY')));
  assert.equal(story.status, 200);
  assert.equal(update.status, 200);
  assert.equal(calls.length, 2);
  assertCall(
    calls[0],
    'social_story',
    [
      'Child: Rowan',
      `Church: ${harbor.name}`,
      `Service: ${harbor.service}`,
      `Room: ${harbor.room}`,
      `Leader: ${harbor.leader}`,
      `Plan: ${harbor.plan}`,
      'Sensory needs: TICK-QUIET-ROOM',
    ].join('\n'),
  );
  assertCall(
    calls[1],
    'sunday_update',
    'Child: Rowan\nLeader: Ms. Dana\nChurch: Example Harbor Fellowship\nVolunteer notes:\nTICK-AFTER-SUNDAY',
  );
  const storySystem = systemText(calls[0]);
  assert.equal(storySystem.includes('rather than a dict'), true);
  assert.equal(storySystem.includes('third person'), true);
  assert.equal(storySystem.includes('preferred name'), true);
  assert.equal(storySystem.includes('church plan'), true);
  assert.equal(storySystem.toLowerCase().includes('calm and positive'), true);
  assert.equal(storySystem.includes('A hard moment is described gently, in words of your own.'), true);
  assert.equal(storySystem.includes('Sometimes songs are loud.'), false);
  assert.equal(storySystem.includes('No labels or medical words.'), true);
  assert.equal(storySystem.includes('leaving the room'), true);
  assert.equal(storySystem.includes('names that appear in the input'), true);
  assert.equal(storySystem.includes('you, Name,'), false);
  const updateSystem = systemText(calls[1]);
  assert.equal(updateSystem.includes('your own words'), true);
  assert.equal(updateSystem.includes('Do not copy the notes.'), true);
  assert.equal(updateSystem.includes('Invent nothing'), true);
  assert.equal(updateSystem.includes("children's ministry leader"), true);
  assert.equal(updateSystem.includes('Sign the note as'), false);
  assert.equal(updateSystem.includes('Jordan Ellis'), false);
  assert.equal(updateSystem.includes("[Volunteer's Name]"), true);
  const storyText = JSON.stringify(await story.json());
  assert.equal(storyText.includes(testEnv.AI_GATEWAY_TOKEN), false);
});

test('the Sunday update user message is plain text', async () => {
  const calls: GatewayCall[] = [];
  const demo = DemoContext.fromBindings(liveShell(), recordingFetch(calls));
  const update = await demo.handle(post('/v1/drafts/sunday-update', sunday('TICK-AFTER-SUNDAY')));
  assert.equal(update.status, 200);
  assert.equal(calls.length, 1);
  const user = calls[0]?.body.messages?.find((message) => message.role === 'user')?.content;
  assert.equal(
    user,
    'Child: Rowan\nLeader: Ms. Dana\nChurch: Example Harbor Fellowship\nVolunteer notes:\nTICK-AFTER-SUNDAY',
  );
});

test('a failed draft does not return the gateway body', async () => {
  const demo = DemoContext.fromBindings(liveShell(), async () => {
    return new Response('GATEWAY-BODY-SHOULD-NOT-LEAK', { status: 502 });
  });
  const response = await demo.handle(post('/v1/drafts/sunday-update', sunday('TICK-AFTER-SUNDAY')));
  assert.equal(response.status, 502);
  const text = await response.text();
  assert.equal(text, '{"error":"generation_failed"}');
  assert.equal(text.includes('GATEWAY-BODY-SHOULD-NOT-LEAK'), false);
  assert.equal(text.includes(testEnv.AI_GATEWAY_TOKEN), false);
});

test('social story requests require childName', async () => {
  const demo = await DemoContext.open('1');
  const story = await demo.handle(socialStory({ lines: [sensory] }));
  const empty = await demo.handle(
    socialStory({ lines: [sensory], childName: '' }),
  );
  const long = await demo.handle(post('/v1/drafts/sunday-update', sunday('TICK-AFTER-SUNDAY', 'R'.repeat(81))));
  assert.equal(story.status, 400);
  assert.equal(empty.status, 400);
  assert.equal(long.status, 400);
  assert.deepEqual(await story.json(), { error: 'invalid_input' });
});

test('the mock Sunday update is not a copy of the notes', async () => {
  const demo = await DemoContext.open('1');
  const update = await demo.handle(post('/v1/drafts/sunday-update', sunday('TICK-AFTER-SUNDAY')));
  assert.equal(update.status, 200);
  const note = (await update.json()) as { body: string };
  assert.equal(note.body.includes('TICK-AFTER-SUNDAY'), false);
  assert.equal(note.body.endsWith(LEADER_SIGN), true);
  assert.equal(note.body.includes('Jordan Ellis'), false);
  assert.equal(note.body.split(LEADER_SIGN).length, 2);
  assert.equal(note.body.includes('['), false);
  assert.notEqual(note.body, 'TICK-AFTER-SUNDAY');
  assert.notEqual(note.body, 'TICK-AFTER-SUNDAY\nRowan');
  assert.notEqual(note.body.replace(/\s+/g, ''), 'TICK-AFTER-SUNDAYRowan');
});

test('parseSocialStory rejects a dict and a body that is only the labels', () => {
  assert.throws(
    () => parseSocialStory({ title: 'Sunday', body: "{ 'loves': 'Soft music' }" }, rowanInput),
    SchemaRejected,
  );
  assert.throws(() => parseSocialStory({ title: 'Sunday', body: labelStory }, rowanInput), SchemaRejected);
  assert.throws(
    () => parseSocialStory({ title: 'Sunday', body: 'The room has "sensory": quiet corners.' }, rowanInput),
    SchemaRejected,
  );
});

test('parseSocialStory accepts a short prose body', () => {
  assert.deepEqual(parseSocialStory({ title: 'Sunday with Rowan', body: safeBody }, rowanInput), {
    title: 'Sunday with Rowan',
    body: safeBody,
  });
});

test('parseSocialStory rejects a care-plan title', () => {
  assert.throws(
    () => parseSocialStory({ title: "Rowan's Sunday Plan", body: safeBody }, rowanInput),
    SchemaRejected,
  );
});

test('parseSundayUpdate rejects the notes and the notes plus only the child name', () => {
  const notes = 'TICK-AFTER-SUNDAY';
  const sign = { leader: 'Ms. Dana', church: 'Example Harbor Fellowship' };
  assert.throws(() => parseSundayUpdate({ body: notes }, notes, 'Juniper', sign), SchemaRejected);
  assert.throws(() => parseSundayUpdate({ body: `${notes}\nJuniper` }, notes, 'Juniper', sign), SchemaRejected);
  assert.throws(() => parseSundayUpdate({ body: `Juniper ${notes}` }, notes, 'Juniper', sign), SchemaRejected);
});

test('parseSundayUpdate accepts the model words around the notes', () => {
  const notes = 'TICK-AFTER-SUNDAY';
  const body = `Sunday went well. ${notes} The quiet seat helped.`;
  const sign = { leader: 'Ms. Dana', church: 'Example Harbor Fellowship' };
  assert.deepEqual(parseSundayUpdate({ body }, notes, 'Juniper', sign), { body: `${body}${LEADER_SIGN}` });
});

test('parseSundayUpdate strips a bracketed name so it never reaches the screen', () => {
  const notes = 'TICK-AFTER-SUNDAY';
  const told = `Sunday went well. ${notes} The quiet seat helped.`;
  const sign = { leader: 'Ms. Dana', church: 'Example Harbor Fellowship' };
  assert.deepEqual(parseSundayUpdate({ body: `${told}\n[Volunteer's Name]` }, notes, 'Juniper', sign), {
    body: `${told}${LEADER_SIGN}`,
  });
  assert.deepEqual(parseSundayUpdate({ body: `${told} [Name]` }, notes, 'Juniper', sign), {
    body: `${told}${LEADER_SIGN}`,
  });
  assert.throws(() => parseSundayUpdate({ body: '[Name]' }, notes, 'Juniper', sign), SchemaRejected);
  assert.throws(() => parseSundayUpdate({ body: "[Volunteer's Name]" }, notes, 'Juniper', sign), SchemaRejected);
  assert.throws(() => parseSundayUpdate({ body: `${notes}\n[Name]` }, notes, 'Juniper', sign), SchemaRejected);
});

test('parseSundayUpdate keeps one leader sign-off and drops a model sign-off', () => {
  const notes = 'TICK-AFTER-SUNDAY';
  const prose = 'Sunday went well. The quiet seat helped.';
  const sign = { leader: 'Ms. Dana', church: 'Example Harbor Fellowship' };
  const volunteer = parseSundayUpdate({ body: `${prose}\nJordan Ellis` }, notes, 'Rowan', sign);
  assert.equal(volunteer.body.endsWith(LEADER_SIGN), true);
  assert.equal(volunteer.body.includes('Jordan Ellis'), false);
  assert.equal(volunteer.body.split(LEADER_SIGN).length, 2);
  const warmly = parseSundayUpdate({ body: `${prose}\nWarmly,\nMs. Dana` }, notes, 'Rowan', sign);
  assert.equal(warmly.body.endsWith(LEADER_SIGN), true);
  assert.equal(warmly.body.split(LEADER_SIGN).length, 2);
  assert.equal(warmly.body.includes('Warmly'), false);
});

test('a dict story body fails the existing generation retry', async () => {
  const dict = await generated(
    '/v1/drafts/social-story',
    { lines: [sensory], childName: 'Rowan', church: harbor },
    { title: 'Sunday', body: "{ 'loves': 'Soft music' }" },
  );
  assert.equal(dict.status, 200);
  assert.equal(dict.calls, 3);
  assert.deepEqual(dict.payload, { title: 'Sunday with Rowan', body: fallbackBody, source: 'fallback' });
  const banned = await generated(
    '/v1/drafts/social-story',
    { lines: [sensory], childName: 'Rowan', church: harbor },
    { title: 'Sunday with Rowan', body: 'Rowan has a peanut allergy.' },
  );
  assert.equal(banned.status, 200);
  assert.equal(banned.calls, 3);
  assert.deepEqual(banned.payload, { title: 'Sunday with Rowan', body: fallbackBody, source: 'fallback' });
  const inflected = await generated(
    '/v1/drafts/social-story',
    { lines: [sensory], childName: 'Rowan', church: harbor },
    {
      title: 'Sunday with Rowan',
      body: 'On Sunday, Rowan goes to Example Harbor Fellowship. Rowan walks to Harbor Room. Ms. Dana says hello. Rowan has peanuts and carries inhalers. Rowan leaves the room. Rowan sits by herself.',
    },
  );
  assert.equal(inflected.status, 200);
  assert.equal(inflected.calls, 3);
  assert.deepEqual(inflected.payload, { title: 'Sunday with Rowan', body: fallbackBody, source: 'fallback' });
  const missingName = await generated(
    '/v1/drafts/social-story',
    { lines: [sensory], childName: 'Al', church: harbor },
    {
      title: 'Sunday',
      body: 'On Sunday, everyone will walk to Example Harbor Fellowship. Harbor Room is quiet. Ms. Dana says hello.',
    },
  );
  assert.equal(missingName.status, 200);
  assert.equal(missingName.calls, 3);
  assert.deepEqual(missingName.payload, { title: 'Sunday with Al', body: fallbackBody, source: 'fallback' });
  const clean = await generated(
    '/v1/drafts/social-story',
    { lines: [sensory], childName: 'Rowan', church: harbor },
    { title: 'Sunday with Rowan', body: safeBody },
  );
  assert.equal(clean.status, 200);
  assert.equal(clean.calls, 1);
  assert.deepEqual(clean.payload, { title: 'Sunday with Rowan', body: safeBody, source: 'model' });
});

test('a care-plan story title fails the existing generation retry', async () => {
  const planned = await generated(
    '/v1/drafts/social-story',
    { lines: [sensory], childName: 'Rowan', church: harbor },
    { title: "Rowan's Sunday Plan", body: safeBody },
  );
  assert.equal(planned.status, 200);
  assert.equal(planned.calls, 3);
  assert.deepEqual(planned.payload, { title: 'Sunday with Rowan', body: fallbackBody, source: 'fallback' });
  const clean = await generated(
    '/v1/drafts/social-story',
    { lines: [sensory], childName: 'Rowan', church: harbor },
    { title: 'Sunday with Rowan', body: safeBody },
  );
  assert.equal(clean.status, 200);
  assert.equal(clean.calls, 1);
  assert.deepEqual(clean.payload, { title: 'Sunday with Rowan', body: safeBody, source: 'model' });
});

test('a copied Sunday update fails the existing generation retry', async () => {
  const notes = 'TICK-AFTER-SUNDAY';
  const copied = await generated('/v1/drafts/sunday-update', sunday(notes), { body: notes });
  assert.equal(copied.status, 502);
  assert.equal(copied.calls, 3);
  const named = await generated('/v1/drafts/sunday-update', sunday(notes), { body: `${notes}\nRowan` });
  assert.equal(named.status, 502);
  assert.equal(named.calls, 3);
});

test('a bracketed Sunday signature is stripped and a placeholder alone retries', async () => {
  const notes = 'TICK-AFTER-SUNDAY';
  const told = `Sunday went well. ${notes} The quiet seat helped.`;
  const signed = await generated(
    '/v1/drafts/sunday-update',
    sunday(notes, 'Juniper'),
    { body: `${told}\n[Volunteer's Name]` },
  );
  assert.equal(signed.status, 200);
  assert.equal(signed.calls, 1);
  assert.deepEqual(signed.payload, { body: `${told}${LEADER_SIGN}` });
  assert.equal(JSON.stringify(signed.payload).includes('['), false);

  const only = await generated('/v1/drafts/sunday-update', sunday(notes, 'Juniper'), { body: '[Name]' });
  assert.equal(only.status, 502);
  assert.equal(only.calls, 3);
  assert.deepEqual(only.payload, { error: 'generation_failed' });
});

test('a Sunday update with the model words is returned', async () => {
  const notes = 'TICK-AFTER-SUNDAY';
  const body = `Sunday went well. ${notes} The quiet seat helped.`;
  const result = await generated('/v1/drafts/sunday-update', sunday(notes), { body });
  assert.equal(result.status, 200);
  assert.equal(result.calls, 1);
  assert.deepEqual(result.payload, { body: `${body}${LEADER_SIGN}` });
});

test('a model sign-off is replaced by the leader and the church', async () => {
  const notes = 'TICK-AFTER-SUNDAY';
  const prose = 'Sunday went well. The quiet seat helped.';
  const volunteer = await generated('/v1/drafts/sunday-update', sunday(notes), { body: `${prose}\nJordan Ellis` });
  assert.equal(volunteer.status, 200);
  const volunteerBody = (volunteer.payload as { body: string }).body;
  assert.equal(volunteerBody.endsWith(LEADER_SIGN), true);
  assert.equal(volunteerBody.includes('Jordan Ellis'), false);
  assert.equal(volunteerBody.split(LEADER_SIGN).length, 2);
  const warmly = await generated('/v1/drafts/sunday-update', sunday(notes), {
    body: `${prose}\nWarmly,\nMs. Dana`,
  });
  assert.equal(warmly.status, 200);
  const warmlyBody = (warmly.payload as { body: string }).body;
  assert.equal(warmlyBody.endsWith(LEADER_SIGN), true);
  assert.equal(warmlyBody.includes('Warmly'), false);
  assert.equal(warmlyBody.split(LEADER_SIGN).length, 2);
});

test('a Sunday update without the leader or church, or with an extra key, is rejected', async () => {
  const demo = await DemoContext.open('1');
  const missing = await demo.handle(
    post('/v1/drafts/sunday-update', { notes: 'TICK-AFTER-SUNDAY', childName: 'Rowan' }),
  );
  const extra = await demo.handle(post('/v1/drafts/sunday-update', sunday('TICK-AFTER-SUNDAY', 'Rowan', { volunteer: 'Jordan Ellis' })));
  assert.equal(missing.status, 400);
  assert.equal(extra.status, 400);
  assert.deepEqual(await missing.json(), { error: 'invalid_input' });
  assert.deepEqual(await extra.json(), { error: 'invalid_input' });
});

const LABEL_TERMS = [
  'special',
  'special needs',
  'autism',
  'autistic',
  'ADHD',
  'disorder',
  'condition',
  'diagnosis',
  'diagnosed',
  'disability',
  'disabled',
  'syndrome',
  'allergy',
  'allergies',
  'allergic',
  'peanut',
  'asthma',
  'inhaler',
  'EpiPen',
  'seizure',
  'medicine',
  'medication',
  'medical',
  'therapy',
  'therapist',
  'nonverbal',
  'meltdown',
  'tantrum',
  'behavior',
  'behaviour',
];

const TONE_TERMS = [
  'overwhelm',
  'overwhelmed',
  'overwhelming',
  'scary',
  'scared',
  'afraid',
  'hurt',
  'wrong',
  'bad',
  "don't worry",
  'don’t worry',
  'dont worry',
  'do not worry',
];

const LEAVING_TERMS = ['step outside', 'go outside', 'leave the room', 'run off', 'run away', 'wander'];

test('storySafety rejects banned words, worried tone, and leaving phrases', () => {
  for (const term of [...LABEL_TERMS, ...TONE_TERMS, ...LEAVING_TERMS]) {
    const mixed = cased(term);
    assert.equal(storySafety({ title: 'Sunday with Rowan', body: `${safeBody} ${mixed}.` }, rowanInput), false, term);
    assert.equal(
      storySafety({ title: `Sunday ${term.toLowerCase()} with Rowan`, body: safeBody }, rowanInput),
      false,
      `title ${term}`,
    );
  }
  assert.equal(storySafety({ title: 'Sunday with Rowan', body: `${safeBody} A therapeutic song is quiet.` }, rowanInput), true);
  assert.equal(storySafety({ title: 'Sunday with Rowan', body: `${safeBody} The sidewalk is outside.` }, rowanInput), true);
  const quiet = { childName: 'Rowan', church: harbor, lines: [{ text: 'Quiet songs.' }] };
  assert.equal(storySafety({ title: 'Sunday with Rowan', body: `${safeBody} Rowan has peanuts.` }, quiet), false);
  assert.equal(storySafety({ title: 'Sunday with Rowan', body: `${safeBody} Rowan carries inhalers.` }, quiet), false);
  assert.equal(storySafety({ title: 'Sunday with Rowan', body: `${safeBody} Rowan leaves the room.` }, quiet), false);
  assert.equal(storySafety({ title: 'Sunday with Rowan', body: `${safeBody} Rowan sits by herself.` }, quiet), false);
});

test('storySafety rejects unknown names, the wrong child, and a missing name', () => {
  assert.equal(storySafety({ title: 'Sunday with Rowan', body: `${safeBody} Rowan met Theo.` }, rowanInput), false);
  assert.equal(storySafety({ title: 'Sunday with Rowan', body: `${safeBody} Rowan met "Theo".` }, rowanInput), false);
  assert.equal(storySafety({ title: 'Sunday with Rowan', body: `${safeBody} Rowan met... Theo.` }, rowanInput), false);
  assert.equal(storySafety({ title: 'Sunday with Rowan', body: `${safeBody} Rowan met A. Theo.` }, rowanInput), false);
  assert.equal(storySafety({ title: 'Sunday with Rowan', body: `${safeBody} J. Lee waves.` }, rowanInput), false);
  assert.equal(storySafety({ title: 'Sunday with Rowan', body: `${safeBody} Mrs. Lee waves.` }, rowanInput), false);
  assert.equal(storySafety({ title: 'Sunday with Rowan', body: `${safeBody} Grace Chapel is nearby.` }, rowanInput), false);
  assert.equal(storySafety({ title: 'Sunday with Rowan', body: `${safeBody} Maya sings.` }, rowanInput), false);
  assert.equal(
    storySafety(
      {
        title: 'Sunday',
        body: 'On Sunday, everyone goes to Example Harbor Fellowship. Ms. Dana says hello in Harbor Room.',
      },
      rowanInput,
    ),
    false,
  );
  assert.equal(
    storySafety(
      {
        title: 'Sunday',
        body: 'On Sunday, everyone will walk to Example Harbor Fellowship. Harbor Room is quiet. Ms. Dana says hello.',
      },
      { childName: 'Al', church: harbor, lines: [{ text: 'Quiet songs.' }] },
    ),
    false,
  );
  assert.equal(
    storySafety(
      {
        title: 'Sunday with Al',
        body: 'Al goes to Example Harbor Fellowship. Al walks to Harbor Room. Ms. Dana says hello.',
      },
      { childName: 'Al', church: harbor, lines: [{ text: 'Quiet songs.' }] },
    ),
    true,
  );
});

test('storySafety rejects a pronoun the lines do not use', () => {
  const sheLines = { childName: 'Rowan', church: harbor, lines: [{ text: 'She likes quiet songs.' }] };
  assert.equal(
    storySafety(
      { title: 'Sunday with Rowan', body: 'On Sunday, he goes to Example Harbor Fellowship. Rowan walks to Harbor Room. Ms. Dana says hello.' },
      sheLines,
    ),
    false,
  );
  const noPronoun = { childName: 'Rowan', church: harbor, lines: [{ text: 'Rowan likes quiet songs.' }] };
  assert.equal(
    storySafety(
      { title: 'Sunday with Rowan', body: 'On Sunday, she goes to Example Harbor Fellowship. Rowan walks to Harbor Room. Ms. Dana says hello.' },
      noPronoun,
    ),
    false,
  );
});

test('storySafety accepts a title, sentence starts, and common capitals', () => {
  const grounded =
    'On Sunday, Rowan goes to Example Harbor Fellowship. Rowan walks to Harbor Room. Ms. Dana says hello.';
  assert.equal(storySafety({ title: 'Rowan Goes to Church', body: grounded }, rowanInput), true);
  assert.equal(storySafety({ title: 'A Happy Sunday', body: grounded }, rowanInput), true);
  assert.equal(
    storySafety(
      {
        title: 'Sunday with Rowan',
        body: 'Today Rowan goes to Example Harbor Fellowship. Rowan walks to Harbor Room. Ms. Dana says hello.',
      },
      rowanInput,
    ),
    true,
  );
  assert.equal(
    storySafety(
      {
        title: 'Sunday with Rowan',
        body: 'On Sunday, Rowan goes to Example Harbor Fellowship. They sing one song in Harbor Room. Ms. Dana says hello.',
      },
      rowanInput,
    ),
    true,
  );
  assert.equal(storySafety({ title: 'Sunday with Rowan', body: `${safeBody} Theo waves.` }, rowanInput), true);
  assert.equal(
    storySafety(
      {
        title: 'Sunday with Rowan',
        body: '"Today Rowan goes to Example Harbor Fellowship. Rowan walks to Harbor Room. Ms. Dana says hello."',
      },
      rowanInput,
    ),
    true,
  );
  assert.equal(
    storySafety(
      {
        title: 'Sunday with Rowan',
        body: 'Ms. Dana says “hello.” Bible time is quiet. Rowan walks to Harbor Room. Ms. Dana says hello.',
      },
      rowanInput,
    ),
    true,
  );
  assert.equal(
    storySafety(
      {
        title: 'Sunday with Rowan',
        body: '(Bible time is quiet.) Rowan goes to Example Harbor Fellowship. Rowan walks to Harbor Room. Ms. Dana says hello.',
      },
      rowanInput,
    ),
    true,
  );
  assert.equal(
    storySafety(
      {
        title: 'Sunday with Rowan',
        body: 'On the 1st. Rowan goes to Example Harbor Fellowship. Rowan walks to Harbor Room. Ms. Dana says hello.',
      },
      rowanInput,
    ),
    true,
  );
  assert.equal(
    storySafety(
      {
        title: 'Sunday with Rowan',
        body: 'On Sunday, Rowan goes to Example Harbor Fellowship and hears Music at Church. Rowan walks to Harbor Room. Ms. Dana says hello.',
      },
      rowanInput,
    ),
    true,
  );
  for (const word of ['Inside', 'Soon', 'Later', 'Afterward', 'Finally', 'Now', 'Here', 'This', 'That', 'Everything']) {
    assert.equal(
      storySafety(
        {
          title: 'Sunday with Rowan',
          body: `On Sunday, Rowan goes to Example Harbor Fellowship and sees ${word} there. Rowan walks to Harbor Room. Ms. Dana says hello.`,
        },
        rowanInput,
      ),
      true,
      word,
    );
  }
});

test('storySafety judges sentence-start He, His, and She only by the pronoun rule', () => {
  assert.equal(
    storySafety(
      {
        title: 'Sunday with Maya',
        body: 'She walks to Harbor Room. Maya goes to Example Harbor Fellowship. Ms. Dana says hello.',
      },
      mayaInput,
    ),
    false,
  );
  assert.equal(
    storySafety(
      {
        title: 'Sunday with Jonah',
        body: 'His Lego stays home. Jonah goes to Example Harbor Fellowship. Jonah walks to Harbor Room. Ms. Dana says hello.',
      },
      jonahInput,
    ),
    true,
  );
  assert.equal(
    storySafety(
      {
        title: 'Sunday with Rowan',
        body: 'On Sunday, Rowan goes to Example Harbor Fellowship and sees His seat in Harbor Room. Ms. Dana says hello.',
      },
      rowanInput,
    ),
    true,
  );
});

test('storySafety accepts a third-person story for Rowan, Maya, and Jonah', () => {
  const stories = [
    [
      rowanInput,
      'Rowan Goes to Church',
      'Today Rowan goes to Example Harbor Fellowship. Rowan walks to Harbor Room. Ms. Dana says hello. They sing one song. Afterward Rowan goes home.',
    ],
    [
      mayaInput,
      'Sunday with Maya',
      'Today Maya goes to Example Harbor Fellowship. Maya walks to Harbor Room. Ms. Dana says hello. They sing one song. Inside Harbor Room, Maya finds a quiet corner.',
    ],
    [
      jonahInput,
      'Sunday with Jonah',
      'His Lego stays home. Today Jonah goes to Example Harbor Fellowship. Jonah walks to Harbor Room. Ms. Dana says hello. They sing one song.',
    ],
  ] as const;
  for (const [input, title, body] of stories) {
    assert.equal(storySafety({ title, body }, input), true, input.childName);
  }
});

test('socialStoryMessages leaves tone and leaving lines out of the model input', () => {
  const parsed = parseSocialStoryRequest({
    childName: 'Rowan',
    church: harbor,
    lines: [
      { field: 'loves', label: 'Loves', text: 'Rowan loves Disney stories and quiet songs.' },
      { field: 'overwhelms', label: 'Overwhelms', text: 'A crowded doorway overwhelms Rowan.' },
      { field: 'calming', label: 'Safety & calming', text: 'Rowan does not usually hurt himself or run off.' },
      { field: 'toileting', label: 'Toileting', text: 'Rowan tells an adult when he needs the bathroom.' },
    ],
  });
  assert.ok(parsed);
  if (parsed === null) return;
  assert.equal(
    parsed.lines.some((line) => line.text.includes('run off')),
    true,
  );
  const messages = socialStoryMessages(parsed);
  const system = messages.find((message) => message.role === 'system')?.content ?? '';
  const user = messages.find((message) => message.role === 'user')?.content ?? '';
  assert.equal(system.includes("use the child's name instead of he or she"), true);
  assert.equal(system.includes('Never use these words:'), true);
  assert.equal(system.includes('allergy'), true);
  assert.equal(system.includes('overwhelm'), true);
  assert.equal(system.includes('run off'), true);
  assert.equal(user.includes('Rowan loves Disney stories and quiet songs.'), true);
  assert.equal(user.includes('when he needs the bathroom'), true);
  assert.equal(user.includes(harbor.name), true);
  assert.equal(user.includes(harbor.room), true);
  assert.equal(user.includes(harbor.leader), true);
  assert.equal(user.includes(harbor.plan), true);
  assert.equal(user.includes('overwhelms Rowan'), false);
  assert.equal(user.includes('hurt himself'), false);
  assert.equal(user.includes('run off'), false);
});

test('socialStoryMessages asks for a short story read aloud to the child', () => {
  const parsed = parseSocialStoryRequest({
    childName: 'Rowan',
    church: harbor,
    lines: [{ field: 'loves', label: 'Loves', text: 'Quiet songs.' }],
  });
  assert.ok(parsed);
  if (parsed === null) return;
  const system = socialStoryMessages(parsed).find((message) => message.role === 'system')?.content ?? '';
  const phrases = [
    'third person',
    'preferred name',
    'church plan',
    'calm and positive',
    'A hard moment is described gently, in words of your own.',
    'No labels or medical words.',
    'leaving the room',
    'names that appear in the input',
    "use the child's name instead of he or she",
    'Never use these words:',
    'Write it as a story read aloud to the child, about 40 to 80 words, in 5 to 8 short sentences and short paragraphs, and stay under 90 words.',
    'The title is a varied story title for this child and this morning, never a Plan or Supporting title.',
    'Use ordinary spoken English, and put the before a room name.',
    'Describe only what the church plan says will happen. Do not add a seat, a kind of seat, a sound level, a song, or an activity the plan does not name. Do not promise that anything will be ready.',
    'End with one warm, calm, reassuring line for the child. It welcomes them and does not promise anything.',
    'Do not use the words support, accommodation, ensure, engage, or upset.',
  ];
  for (const phrase of phrases) {
    assert.equal(system.includes(phrase), true, phrase);
  }
  for (const phrase of ['Sometimes songs are loud.', "Rowan's Sunday at Harbor Room"]) {
    assert.equal(system.includes(phrase), false, phrase);
  }
});

test('storySafety rejects a care-plan title', () => {
  for (const title of ["Rowan's Sunday Plan", 'Supporting Rowan', "ROWAN'S SUNDAY PLAN"]) {
    assert.equal(storySafety({ title, body: safeBody }, rowanInput), false, title);
  }
});

test('storySafety accepts a story title', () => {
  for (const title of ["Rowan's Sunday at Harbor Room", 'Planting with Rowan', 'Explanation for Rowan']) {
    assert.equal(storySafety({ title, body: safeBody }, rowanInput), true, title);
  }
  assert.equal(
    storySafety(
      { title: 'Sunday with Rowan', body: `${safeBody} The plan is quiet, supporting the song.` },
      rowanInput,
    ),
    true,
  );
});

test('storySafety rejects care-plan voice words', () => {
  for (const word of ['support', 'supports', 'accommodation', 'ensure', 'engage', 'upset']) {
    assert.equal(
      storySafety({ title: 'Sunday with Rowan', body: `${safeBody} ${word}.` }, rowanInput),
      false,
      word,
    );
    assert.equal(
      storySafety({ title: `${word} with Rowan`, body: safeBody }, rowanInput),
      false,
      `title ${word}`,
    );
  }
  assert.equal(storySafety({ title: 'Sunday with Rowan', body: `${safeBody} Support.` }, rowanInput), false);
  assert.equal(storySafety({ title: 'UPSET with Rowan', body: safeBody }, rowanInput), false);
});

test('storySafety keeps supporter and upsetting', () => {
  for (const word of ['supporter', 'upsetting', 'ensures', 'engagement', 'accommodations', 'planned']) {
    assert.equal(
      storySafety({ title: 'Sunday with Rowan', body: `${safeBody} Rowan sees ${word}.` }, rowanInput),
      true,
      word,
    );
  }
});

test('storySafety rejects a body longer than 90 words', () => {
  const sits = (words: number) => `Rowan ${'sits '.repeat(words - 2)}sits.`;
  assert.equal(storySafety({ title: 'Sunday with Rowan', body: sits(90) }, rowanInput), true);
  assert.equal(
    storySafety({ title: 'Sunday with Rowan', body: `Hello, world. ${sits(88)}` }, rowanInput),
    true,
  );
  assert.equal(storySafety({ title: 'Sunday with Rowan', body: sits(91) }, rowanInput), false);
});

test('storySafety rejects a body longer than eight sentences', () => {
  const pass = [
    'On Sunday, Rowan goes to Example Harbor Fellowship.',
    'Rowan walks to Harbor Room.',
    'Ms. Dana says hello.',
    'Rowan sits.',
    'Rowan listens.',
    'Rowan smiles.',
    'Rowan waves.',
    'Rowan goes home.',
  ].join('\n\n');
  const fail = [
    'On Sunday, Rowan goes to Example Harbor Fellowship.',
    'Rowan walks to Harbor Room.',
    'Rowan sits.',
    'Rowan listens.',
    'Rowan smiles.',
    'Rowan waves.',
    'Rowan claps.',
    'Rowan reads.',
    'Rowan goes home.',
  ].join(' ');
  assert.equal(storySafety({ title: 'Sunday with Rowan', body: pass }, rowanInput), true);
  assert.equal(storySafety({ title: 'Sunday with Rowan', body: fail }, rowanInput), false);
});

test('storySafety counts an ellipsis as one sentence', () => {
  const body = [
    'Rowan waits... then sits down at Example Harbor Fellowship.',
    'Rowan walks to Harbor Room.',
    'Rowan sits.',
    'Rowan listens.',
    'Rowan smiles.',
    'Rowan waves.',
    'Rowan claps.',
    'Rowan goes home.',
  ].join(' ');
  const spaced = [
    'On Sunday, Rowan goes to Example Harbor Fellowship.',
    'Rowan walks to Harbor Room.',
    'Ms. Dana says hello.',
    'Rowan sits . . . quietly.',
    'Rowan listens.',
    'Rowan smiles.',
    'Rowan waves.',
    'Rowan goes home.',
  ].join('\n\n');
  assert.equal(storySafety({ title: 'Sunday with Rowan', body }, rowanInput), true);
  assert.equal(storySafety({ title: 'Sunday with Rowan', body: spaced }, rowanInput), true);
});

test('storySafety rejects the long grounded Rowan story', () => {
  const body = [
    'On Sunday at 9:30, Rowan and his grown-up go to Example Harbor Fellowship.',
    'Rowan walks to Harbor Room. Ms. Dana is there to say hello.',
    'First there is a short welcome. Then everyone sings one song. Rowan likes quiet songs.',
    'Next there is a quiet activity. Rowan can sit in a soft seat away from bright lights. If Rowan needs a quiet break, a grown-up will help.',
    "When it is over, Rowan's grown-up comes back to Harbor Room, and it is time to go home.",
  ].join('\n\n');
  assert.equal(storySafety({ title: 'Sunday with Rowan', body }, rowanInput), false);
});

test('storySafety accepts the grounded Rowan story', () => {
  const body = [
    'On Sunday at 9:30, Rowan and his grown-up go to Example Harbor Fellowship.',
    'Rowan walks to Harbor Room. Ms. Dana says hello.',
    'There is a short welcome, one song, and a quiet activity.',
    "When it is over, Rowan's grown-up comes back.",
  ].join('\n\n');
  assert.equal(storySafety({ title: 'Sunday with Rowan', body }, rowanInput), true);
});

test('storySafety rejects the recorded live excerpts', () => {
  const maya = { childName: 'Maya', church: harbor, lines: [{ text: 'Maya loves dinosaurs and digging in the sand table.' }] };
  const jonah = { childName: 'Jonah', church: harbor, lines: [{ text: 'Jonah loves Lego and building on the floor.' }] };
  const excerpts = [
    [maya, "don't forget that you have a peanut allergy. And if you need your inhaler for your asthma, it's here."],
    [maya, 'because I have a peanut allergy. I also have my inhaler with me in case I need it for my asthma, and our volunteers are aware of my autism.'],
    [maya, "keep you safe from peanut foods because of your allergy. They're also aware of your autism and asthma, and they have your inhaler."],
    [jonah, 'a big room with a high ceiling. listen to the service. build with some blocks like you do with your Lego at home.'],
    [rowanInput, 'You arrive at church and see a lot of people at the doorway. It might feel overwhelming.'],
    [rowanInput, 'The room is big and might be a little loud. Sometimes we sing songs like the ones from Disney stories.'],
  ] as const;
  for (const [input, body] of excerpts) {
    assert.equal(storySafety({ title: 'Sunday', body }, input), false, body);
  }
});

test('a story request with no care lines still returns a church story', async () => {
  const demo = await DemoContext.open('1');
  const response = await demo.handle(socialStory({ lines: [], childName: 'Rowan' }));
  assert.equal(response.status, 200);
  const body = (await response.json()) as { title: string; body: string; source: string };
  assert.equal(body.source, 'model');
  assert.equal(body.body.includes('Example Harbor Fellowship'), true);
  assert.equal(
    storySafety(body, { childName: 'Rowan', church: harbor, lines: [] }),
    true,
  );
});

test('socialStoryMessages drops allergies and medical and names the church', () => {
  const parsed = parseSocialStoryRequest({
    childName: 'Rowan',
    church: harbor,
    lines: [
      { field: 'loves', label: 'Loves', text: 'Quiet songs.' },
      { field: 'allergies', label: 'Allergies & health', text: 'PEANUT-SECRET' },
      { field: 'medical', label: 'Medical / health notes', text: 'INHALER-SECRET' },
    ],
  });
  assert.ok(parsed);
  if (parsed === null) return;
  assert.deepEqual(
    parsed.lines.map((line) => line.text),
    ['Quiet songs.'],
  );
  const onlyMedical = parseSocialStoryRequest({
    childName: 'Rowan',
    church: harbor,
    lines: [{ field: 'allergies', label: 'Allergies & health', text: 'PEANUT-SECRET' }],
  });
  assert.ok(onlyMedical);
  if (onlyMedical === null) return;
  assert.deepEqual(onlyMedical.lines, []);
  const user = socialStoryMessages(parsed).find((message) => message.role === 'user')?.content ?? '';
  assert.equal(user.includes('PEANUT-SECRET'), false);
  assert.equal(user.includes('INHALER-SECRET'), false);
  assert.equal(user.includes(harbor.name), true);
  assert.equal(user.includes(harbor.room), true);
  assert.equal(user.includes(harbor.leader), true);
  assert.equal(user.includes(harbor.plan), true);
  assert.equal(user.includes('Quiet songs.'), true);
});

test('a social story gateway failure returns the Sunday fallback', async () => {
  let calls = 0;
  const demo = DemoContext.fromBindings(liveShell(), async () => {
    calls += 1;
    return new Response('GATEWAY-BODY-SHOULD-NOT-LEAK', { status: 502 });
  });
  const response = await demo.handle(socialStory({ lines: [sensory], childName: 'Rowan' }));
  assert.equal(response.status, 200);
  assert.equal(calls, 3);
  const text = await response.text();
  assert.equal(text.includes('GATEWAY-BODY-SHOULD-NOT-LEAK'), false);
  assert.deepEqual(JSON.parse(text), { title: 'Sunday with Rowan', body: fallbackBody, source: 'fallback' });
});

test('the Sunday fallback passes storySafety, stays short, and keeps pickup', () => {
  const { title, body } = fallbackSocialStory({ childName: 'Rowan', church: harbor, lines: [] });
  assert.equal(storySafety({ title, body }, { childName: 'Rowan', church: harbor, lines: rowanLines }), true);
  assert.equal(countedSentences(body) <= 8, true);
  assert.equal(countedWords(body) <= 90, true);
  assert.equal(body.includes('comes back for you'), true);
  assert.equal(body.endsWith('Ms. Dana is glad you came.'), true);
  assert.equal(body.includes('the Harbor Room'), true);
  assert.equal(body.includes('welcome desk'), false);
  assert.equal(body.includes('pick you up'), false);
});

test('the fallback welcome agrees with one leader or two', () => {
  for (const [leader, closing] of [
    ['Ms. Dana', 'Ms. Dana is glad you came.'],
    ['Amanda', 'Amanda is glad you came.'],
    ['Dana and Lee', 'Dana and Lee are glad you came.'],
    ['', 'We are glad you came.'],
    ['   ', 'We are glad you came.'],
  ] as const) {
    const { body } = fallbackSocialStory({ childName: 'Rowan', church: { ...harbor, leader }, lines: [] });
    assert.equal(body.split('\n\n').at(-1), closing, leader);
    assert.equal(body.includes('comes back for you'), true, leader);
  }
});

test('a long church plan keeps every Sunday sentence in the fallback', async () => {
  const plan = `${'Sing a short song and sit quietly. '.repeat(50)}End.`.slice(0, 1800);
  const church = { ...harbor, plan };
  const full = sundayFallbackSentences(church).join('\n\n');
  const demo = DemoContext.fromBindings(liveShell(), async () => new Response('down', { status: 502 }));
  const response = await demo.handle(socialStory({ lines: [sensory], childName: 'Rowan', church }));
  assert.equal(response.status, 200);
  const payload = (await response.json()) as { title: string; body: string; source: string };
  assert.equal(payload.source, 'fallback');
  assert.equal(payload.body, full);
  assert.equal(payload.body.includes('there is a quiet spot in the room.'), true);
  assert.equal(payload.body.endsWith('is glad you came.'), true);
  assert.equal(payload.body.length > 2000, true);
  assert.equal(payload.body.length <= SUNDAY_STORY_BODY_MAX, true);
});

test('mock mode story passes storySafety', async () => {
  const demo = await DemoContext.open('1');
  const lines = [
    { field: 'allergies', label: 'Allergies & health', text: 'Peanut allergy and an inhaler.' },
    { field: 'medical', label: 'Medical / health notes', text: 'Asthma medicine.' },
    { field: 'overwhelms', label: 'Overwhelms', text: 'A crowded doorway overwhelms Rowan.' },
    { field: 'calming', label: 'Safety & calming', text: 'Rowan does not usually hurt himself or run off.' },
  ];
  const response = await demo.handle(socialStory({ lines, childName: 'Rowan' }));
  assert.equal(response.status, 200);
  const body = (await response.json()) as { title: string; body: string; source: string };
  assert.equal(body.title, 'Sunday with Rowan');
  assert.equal(body.source, 'model');
  assert.equal(body.body.includes('Peanut'), false);
  assert.equal(body.body.includes('inhaler'), false);
  assert.equal(body.body.includes('hurt'), false);
  assert.equal(body.body.includes('run off'), false);
  assert.equal(
    storySafety(body, {
      childName: 'Rowan',
      church: harbor,
      lines: lines.map((line) => ({ text: line.text })),
    }),
    true,
  );
});

function countedWords(body: string): number {
  let count = 0;
  for (const token of body.split(/\s+/u)) {
    if (/[\p{L}\p{N}]/u.test(token)) count += 1;
  }
  return count;
}

function countedSentences(body: string): number {
  let count = 0;
  for (let index = 0; index < body.length; index += 1) {
    const mark = body[index];
    if (mark !== '.' && mark !== '!' && mark !== '?') continue;
    if (mark === '.' && /(?:^|[^\p{L}])Ms$/iu.test(body.slice(0, index))) continue;
    count += 1;
  }
  return count;
}

function cased(term: string): string {
  return [...term].map((char, index) => (index % 2 === 0 ? char.toLowerCase() : char.toUpperCase())).join('');
}

async function assertDrafts(demo: DemoContext): Promise<void> {
  const fields = ['loves', 'overwhelms', 'whatHelps', 'communication', 'sensory', 'medical'] as const;
  for (const field of fields) {
    const text = `TEXT-${field}`;
    const response = await demo.handle(
      socialStory({
        lines: [{ field, label: 'Label', text }],
        childName: 'Rowan',
      }),
    );
    assert.equal(response.status, 200, field);
    const body = (await response.json()) as { title: string; body: string };
    assert.equal(body.title, 'Sunday with Rowan');
    assert.equal(body.body.includes(text), false);
    assert.equal(body.body.includes(harbor.name), true);
    assert.equal(body.body.includes(harbor.room), true);
    assert.equal(body.body.includes(harbor.leader), true);
    assert.equal(storySafety(body, { childName: 'Rowan', church: harbor, lines: [{ text }] }), true);
  }

  const hidden = await demo.handle(socialStory({ lines: [sensory], childName: 'Rowan' }));
  assert.equal(hidden.status, 200);
  const hiddenBody = (await hidden.json()) as { body: string };
  assert.equal(hiddenBody.body.includes('TICK-QUIET-ROOM'), false);
  assert.equal(hiddenBody.body.includes('TICK-MEDICAL'), false);

  const shown = await demo.handle(
    socialStory({
      lines: [{ field: 'medical', label: 'Medical / health notes', text: 'TICK-MEDICAL' }],
      childName: 'Rowan',
    }),
  );
  const shownBody = (await shown.json()) as { body: string };
  assert.equal(shownBody.body.includes('TICK-MEDICAL'), false);

  const extra = await demo.handle(socialStory({ lines: [sensory], childName: 'Rowan', extra: true }));
  assert.equal(extra.status, 400);
  assert.deepEqual(await extra.json(), { error: 'invalid_input' });

  const nested = await demo.handle(
    socialStory({
      lines: [{ ...sensory, extra: true }],
      childName: 'Rowan',
    }),
  );
  assert.equal(nested.status, 400);

  const aged = await demo.handle(
    socialStory({
      lines: [sensory],
      childName: 'Rowan',
      church: { ...harbor, ages: 'Ages 5-12' },
    }),
  );
  assert.equal(aged.status, 400);

  const broken = await demo.handle(
    new Request('http://example.com/v1/drafts/sunday-update', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    }),
  );
  assert.equal(broken.status, 400);
  assert.deepEqual(await broken.json(), { error: 'invalid_input' });

  const update = await demo.handle(post('/v1/drafts/sunday-update', sunday('TICK-AFTER-SUNDAY')));
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

function socialStory(body: Record<string, unknown>): Request {
  return post('/v1/drafts/social-story', { church: harbor, ...body });
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
