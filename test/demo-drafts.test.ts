import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DemoContext } from '../scripts/demo-engine.ts';
import {
  fallbackSocialStory,
  parseSocialStory,
  parseSocialStoryRequest,
  parseSundayUpdate,
  socialStoryMessages,
  socialStorySchema,
  storySafety,
} from '../src/demo-drafts.ts';
import { SchemaRejected } from '../src/errors.ts';
import { STORY_BEATS, SUNDAY_STORY_PAGE_MAX, templateStoryPages, type StoryPages } from '../src/sunday-story-text.ts';
import { postAcknowledgement } from '../web/lib/drafts.ts';
import { chatEnvelope, testEnv } from './fixtures.ts';
import { juniperAnswers, juniperName } from './fixtures/long-intake.ts';

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
function prose(pages: StoryPages): string {
  return STORY_BEATS.map((beat) => pages[beat]).join('\n');
}

type WritablePages = { -readonly [beat in keyof StoryPages]: string };

function longQuietPage(): string {
  const stem = 'Rowan can hold a Disney story and wait by the doorway near softer lights';
  const beat = ' and a quiet hello';
  let body = stem;
  while ((body + beat).length + 1 <= 1500) body += beat;
  return `${body}.`;
}

function recordedPages(): WritablePages {
  return {
    arrive:
      'On Sunday morning Rowan and a grown-up go to Example Harbor Fellowship. Rowan can hear a quiet song on the way in.',
    doors:
      'Rowan walks through the front doors at Example Harbor Fellowship and pauses. A greeter smiles and says hello to Rowan there.',
    desk: 'At the welcome desk Rowan checks in and picks up a name tag. Rowan can point to the tag and wait with a grown-up.',
    room: 'Rowan goes to the Harbor Room for a short welcome and a quiet activity. Rowan can stay near a doorway if the room is busy.',
    helper: 'Ms. Dana and the helpers are in the Harbor Room with Rowan. Rowan can hold a quiet story while the helpers stay nearby.',
    quiet:
      'A quiet tick helps Rowan settle in the Harbor Room during the morning. Rowan can look at the quiet tick and take a short break.',
    pickup:
      'When the morning is over a grown-up comes back to the Harbor Room for Rowan. Rowan can leave with that grown-up after a quiet goodbye.',
  };
}

function dayPages(child: string, helper: string, quiet: string): WritablePages {
  return {
    arrive: `${child} and a grown-up go to Example Harbor Fellowship for Sunday 9:30. The morning can start with a short welcome.`,
    doors: `${child} walks in the front doors at Example Harbor Fellowship. A greeter smiles and says hello to ${child} by name.`,
    desk: `At the welcome desk, ${child} checks in and gets a name tag. ${child} can wait there with a grown-up before class.`,
    room: `${child} goes to the Harbor Room for a short welcome, one song, and a quiet activity. ${child} can look around the room.`,
    helper,
    quiet,
    pickup: `When the time is over, a grown-up comes back to the Harbor Room for ${child}. ${child} can leave with that grown-up.`,
  };
}

function personalPages(): WritablePages {
  return {
    arrive:
      'On Sunday morning Rowan and a grown-up go to Example Harbor Fellowship. Rowan can hear a quiet song on the way in.',
    doors:
      'Rowan walks through the front doors at Example Harbor Fellowship and pauses. A greeter smiles and says hello to Rowan there.',
    desk: 'At the welcome desk Rowan checks in and picks up a name tag. Rowan can point to the tag and wait with a grown-up.',
    room: 'Rowan goes to the Harbor Room for a short welcome and a quiet activity. Rowan can stay near a doorway if the room is busy.',
    helper:
      'Ms. Dana and the helpers are in the Harbor Room with Rowan. Rowan can hold a Disney story while the helpers stay nearby.',
    quiet:
      'Rowan can sit in a softer seat away from bright lights in the Harbor Room. A quiet break helps Rowan settle and look at a Disney story.',
    pickup:
      'When the morning is over a grown-up comes back to the Harbor Room for Rowan. Rowan can leave with that grown-up after a quiet goodbye.',
  };
}

function pageSentences(text: string): number {
  let count = 0;
  for (const mark of text) {
    if (mark === '.' || mark === '!' || mark === '?') count += 1;
  }
  return count;
}

const labelStory =
  'Loves. Overwhelms. What helps. Communication. Sensory needs. Medical / health notes.';

const NEXT_QUESTION = 'How does {child} usually let you know what they need?';
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
    assert.equal(body.line, PARENT_FALLBACK, answer);
    assert.equal(ackWords(body.line) >= 12 && ackWords(body.line) <= 25, true, answer);
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
    const body = (await response.json()) as { relevant: boolean; line: string; clarifyingPrompt: string };
    assert.equal(body.relevant, true, answer);
    assert.equal(body.clarifyingPrompt, '', answer);
    assert.equal(ackWords(body.line) >= 12 && ackWords(body.line) <= 25, true, answer);
    assert.equal(/[.!]$/u.test(body.line), true, answer);
    assert.equal(CHILD_PRONOUN.test(body.line), false, answer);
    assert.equal(/allerg|peanut/iu.test(body.line), false, answer);
    if (answer === 'not sure' || answer === 'nothing special') {
      assert.equal(body.line, PARENT_FALLBACK, answer);
    }
    if (answer === 'Picture cards.') {
      assert.equal(body.line, 'Thank you. Knowing about picture can help the volunteers prepare for Sunday.', answer);
    }
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
      return chatEnvelope({ relevant: true, line: WARM_ACK, clarifyingPrompt: '' });
    });
    const response = await demo.handle(
      post('/v1/drafts/acknowledgement', { answer: 'Picture cards.', nodeId: 'communication' }),
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      relevant: true,
      line: WARM_ACK,
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
  assert.equal(calls, 2);
  const body = (await response.json()) as { line: string };
  assert.equal(body.line, PARENT_FALLBACK);
});

test('one upstream acknowledgement error retries once and keeps the second line', async () => {
  let calls = 0;
  const demo = DemoContext.fromBindings(liveShell(), async () => {
    calls += 1;
    if (calls === 1) return new Response('unavailable', { status: 502 });
    return chatEnvelope({ relevant: true, line: WARM_ACK, clarifyingPrompt: '' });
  });
  const response = await demo.handle(
    post('/v1/drafts/acknowledgement', { answer: 'Picture cards.', nodeId: 'communication' }),
  );
  assert.equal(response.status, 200);
  assert.equal(calls, 2);
  assert.deepEqual(await response.json(), { relevant: true, line: WARM_ACK, clarifyingPrompt: '' });
});

test('an acknowledgement longer than 2000 characters is rejected before fetch', async () => {
  const result = await rejectedAcknowledgement({ answer: 'a'.repeat(2001), nodeId: 'communication' });
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

test('a long answer is acknowledged from its first 1500 characters', async () => {
  const replies = [
    'Thank you. Knowing about the brother can help the volunteers prepare Sunday.',
    'That is really helpful. A ribbon can come along when the team gets ready.',
    'Thanks for saying so. The window can stay in view while the room gets ready.',
    'Noted, and thank you. A bakery stop can stay in the Sunday morning plan.',
    'Thank you for that detail. Bottle caps can stay in the story the team reads.',
  ] as const;
  const sent: string[] = [];
  let calls = 0;
  const demo = DemoContext.fromBindings(liveShell(), async (input, init) => {
    const request = new Request(input, init);
    const body = JSON.parse(await request.text()) as { messages?: { role?: string; content?: string }[] };
    sent.push(body.messages?.find((message) => message.role === 'user')?.content ?? '');
    const line = replies[calls] ?? replies[0];
    calls += 1;
    return chatEnvelope({ relevant: true, line, clarifyingPrompt: '' });
  });
  const openings: string[] = [];
  const recent: string[] = [];
  for (let index = 0; index < replies.length; index += 1) {
    const answer = longAcknowledgement(index);
    assert.equal(answer.length >= 1500 && answer.length <= 2000, true, String(index));
    const response = await demo.handle(
      post('/v1/drafts/acknowledgement', {
        answer,
        nodeId: 'loves',
        ...(recent.length === 0 ? {} : { recent: recent.slice(-3) }),
      }),
    );
    assert.equal(response.status, 200, String(index));
    const body = (await response.json()) as { line: string };
    assert.equal(body.line, replies[index], String(index));
    openings.push(body.line.toLowerCase().split(/\s+/u).slice(0, 3).join(' '));
    recent.push(body.line);
  }
  assert.equal(new Set(openings).size, replies.length);
  assert.equal(calls, replies.length);
  const first = sent[0] ?? '';
  const told = first.slice('Answer: '.length, first.indexOf('\nSection: '));
  assert.equal(told, juniperAnswers.loves);
  assert.equal(juniperAnswers.loves.length > 1500 && juniperAnswers.loves.length <= 2000, true);
  assert.equal(sent[4]?.includes(replies[1]), true);
  assert.equal(sent[4]?.includes(replies[2]), true);
  assert.equal(sent[4]?.includes(replies[3]), true);
});

test('a repeated acknowledgement opening is retried once', async () => {
  let calls = 0;
  const demo = DemoContext.fromBindings(liveShell(), async () => {
    calls += 1;
    return chatEnvelope({
      relevant: true,
      line: 'Cards can help the room team get ready for Sunday morning today.',
      clarifyingPrompt: '',
    });
  });
  const response = await demo.handle(
    post('/v1/drafts/acknowledgement', {
      answer: 'Picture cards.',
      nodeId: 'communication',
      recent: ['Cards can help the volunteers.'],
    }),
  );
  assert.equal(response.status, 200);
  assert.equal(calls, 2);
  const body = (await response.json()) as { line: string };
  assert.equal(body.line.split(/\s+/u).slice(0, 3).join(' ').toLowerCase() === 'cards can help', false);
});

test('an acknowledgement outside 12 to 25 words is retried once and then falls back', async () => {
  const line = `${Array.from({ length: 26 }, () => 'a').join(' ')}.`;
  const result = await acknowledgementFrom(line);
  assert.equal(result.status, 200);
  assert.equal(result.calls, 2);
  assert.deepEqual(result.body, {
    relevant: true,
    line: PARENT_FALLBACK,
    clarifyingPrompt: '',
    fallbackReason: 'line_rejected_words',
  });
});

test('the client sends the last three acknowledgement lines', async () => {
  const bodies: unknown[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return Response.json({ relevant: true, line: 'Cards can help the volunteers.', clarifyingPrompt: '' });
  };
  try {
    await postAcknowledgement('Picture cards.', 'communication', ['one.', 'two.', 'three.', 'four.']);
    await postAcknowledgement('Picture cards.', 'communication');
  } finally {
    globalThis.fetch = original;
  }
  assert.deepEqual(bodies[0], {
    answer: 'Picture cards.',
    nodeId: 'communication',
    recent: ['two.', 'three.', 'four.'],
  });
  assert.deepEqual(bodies[1], { answer: 'Picture cards.', nodeId: 'communication' });
});

function longAcknowledgement(index: number): string {
  if (index === 0) return juniperAnswers.loves;
  return `${juniperAnswers.loves} ${'colorful bottle caps '.repeat(40)}`.slice(0, 1600 + index * 70);
}

test('an acknowledgement with a newline comes back as one line', async () => {
  const demo = DemoContext.fromBindings(liveShell(), async () =>
    chatEnvelope({
      relevant: true,
      line: 'Thank you.\nKnowing about the morning can help the volunteers prepare Sunday.',
      clarifyingPrompt: '',
    }),
  );
  const response = await demo.handle(
    post('/v1/drafts/acknowledgement', { answer: 'Picture cards.', nodeId: 'communication' }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    relevant: true,
    line: WARM_ACK,
    clarifyingPrompt: '',
  });
});

const WARM_ACK = 'Thank you. Knowing about the morning can help the volunteers prepare Sunday.';
const PARENT_FALLBACK = 'Thank you. That detail can help the volunteers prepare the room for Sunday.';

function ackWords(line: string): number {
  return line.trim().split(/\s+/u).length;
}

const ACKNOWLEDGEMENT_PROMPT = [
  "Ready helps parents of children who need extra support prepare a church kids' ministry, its volunteers and leaders, for Sunday.",
  'Each answer should tell those volunteers something about this child relevant to the asked question.',
  'The data is fictional. Do not invent medical facts.',
  'Return relevant, line, and clarifyingPrompt.',
  'line is a warm reply to the parent, in one or two sentences and about 12 to 25 words.',
  'line thanks the parent or affirms the answer, names one detail from the answer, and says why that detail can help the church team.',
  'Use can or may. Do not promise an outcome or a feeling, and do not write will, we will, or we\'ll.',
  'Vary the opening. Do not reuse an opening from the recent lines.',
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
  'Example: "Thank you. Knowing about the LEGO collection can help the volunteers connect on Sunday." for an answer that names a LEGO collection.',
  'Example: "That is really helpful. The team can keep the room quieter when loud sounds start." for an answer about loud sounds.',
].join('\n');

test('a good acknowledgement is returned unchanged', async () => {
  const line = WARM_ACK;
  const result = await acknowledgementFrom(line);
  assert.equal(result.status, 200);
  assert.equal(result.calls, 1);
  assert.equal(result.maxTokens, 80);
  assert.equal(result.system, ACKNOWLEDGEMENT_PROMPT);
  assert.equal(result.user, ACK_USER);
  assert.deepEqual(result.body, { relevant: true, line, clarifyingPrompt: '' });
});

test('an acknowledgement of 12 to 25 words is returned unchanged', async () => {
  const line = WARM_ACK;
  assert.equal(ackWords(line) >= 12 && ackWords(line) <= 25, true);
  const result = await acknowledgementFrom(line);
  assert.equal(result.status, 200);
  assert.equal(result.calls, 1);
  assert.deepEqual(result.body, { relevant: true, line, clarifyingPrompt: '' });
});

test('an acknowledgement past 200 characters falls back', async () => {
  const line = `${'helpful '.repeat(30).trim()}.`;
  assert.equal(line.length > 200, true);
  const result = await acknowledgementFrom(line);
  assert.equal(result.status, 200);
  assert.equal(result.calls, 2);
  assert.equal((result.body as { fallbackReason?: string }).fallbackReason, 'line_rejected_length');
});

test('a promised outcome in an acknowledgement falls back', async () => {
  const result = await acknowledgementFrom(
    'Thank you. Knowing about the LEGO collection will help the volunteers connect on Sunday.',
  );
  assert.equal(result.status, 200);
  assert.equal(result.calls, 2);
  assert.equal((result.body as { line: string; fallbackReason?: string }).line, PARENT_FALLBACK);
  assert.equal((result.body as { fallbackReason?: string }).fallbackReason, 'line_rejected_shape');
});

test('a terse acknowledgement summary falls back', async () => {
  const terse = await acknowledgementFrom('LEGO collection.');
  assert.equal(terse.calls, 1);
  assert.equal((terse.body as { fallbackReason?: string }).fallbackReason, 'line_rejected_shape');
  const loved = await acknowledgementFrom('Pip the fox is loved.');
  assert.equal(loved.calls, 1);
  assert.equal((loved.body as { line: string }).line, PARENT_FALLBACK);
  assert.equal((loved.body as { fallbackReason?: string }).fallbackReason, 'line_rejected_shape');
});

test('a cut-off acknowledgement falls back', async () => {
  const result = await acknowledgementFrom('Thank you for telling me tha');
  assert.equal(result.status, 200);
  assert.equal(result.calls, 2);
  assert.deepEqual(result.body, {
    relevant: true,
    line: PARENT_FALLBACK,
    clarifyingPrompt: '',
    fallbackReason: 'line_rejected_shape',
  });
});

test('an acknowledgement with a non-Latin character falls back', async () => {
  const result = await acknowledgementFrom('Thank you, that helps噪.');
  assert.equal(result.status, 200);
  assert.equal(result.calls, 2);
  assert.deepEqual(result.body, {
    relevant: true,
    line: PARENT_FALLBACK,
    clarifyingPrompt: '',
    fallbackReason: 'safety_script',
  });
});

test('an acknowledgement that names a diagnosis falls back', async () => {
  for (const word of ['autism', 'Aphasia', 'diagnosis', 'disorder', 'disability', 'impairment', 'individuals']) {
    const result = await acknowledgementFrom(`Thank you for the note on ${word}.`);
    assert.equal(result.status, 200, word);
    assert.equal(result.calls, 2, word);
    assert.deepEqual(
      result.body,
      { relevant: true, line: PARENT_FALLBACK, clarifyingPrompt: '', fallbackReason: 'safety_banned_word' },
      word,
    );
  }
});

test('an acknowledgement longer than 200 characters falls back', async () => {
  const line = `${'a'.repeat(200)}.`;
  assert.equal(line.length, 201);
  const result = await acknowledgementFrom(line);
  assert.equal(result.status, 200);
  assert.equal(result.calls, 2);
  assert.deepEqual(result.body, {
    relevant: true,
    line: PARENT_FALLBACK,
    clarifyingPrompt: '',
    fallbackReason: 'line_rejected_length',
  });
});

test('an acknowledgement with a question mark falls back', async () => {
  const result = await acknowledgementFrom('Really? That helps.');
  assert.equal(result.status, 200);
  assert.equal(result.calls, 2);
  assert.deepEqual(result.body, {
    relevant: true,
    line: PARENT_FALLBACK,
    clarifyingPrompt: '',
    fallbackReason: 'line_rejected_shape',
  });
});

test('an acknowledgement that uses a child pronoun falls back', async () => {
  for (const line of ['She loves trains.', 'He likes a quiet hello.', 'They love trains.']) {
    const result = await acknowledgementFrom(line);
    assert.equal(result.status, 200, line);
    assert.equal(result.calls, 2, line);
    assert.deepEqual(
      result.body,
      { relevant: true, line: PARENT_FALLBACK, clarifyingPrompt: '', fallbackReason: 'safety_pronoun' },
      line,
    );
  }
});

test('an acknowledgement that repeats the answer falls back', async () => {
  const line = 'Quiet mornings work best.';
  const result = await acknowledgementFrom(line, line);
  assert.equal(result.status, 200);
  assert.equal(result.calls, 2);
  assert.deepEqual(result.body, {
    relevant: true,
    line: PARENT_FALLBACK,
    clarifyingPrompt: '',
    fallbackReason: 'line_rejected_restatement',
  });
});

test('a live off-topic answer keeps the model not-relevant verdict', async () => {
  const prompt = 'I want to make sure I understand. What does that have to do with Sunday?';
  const demo = DemoContext.fromBindings(liveShell(), async () =>
    chatEnvelope({ relevant: false, line: WARM_ACK, clarifyingPrompt: prompt }),
  );
  const response = await demo.handle(
    post('/v1/drafts/acknowledgement', { answer: 'pizza rocket sandwich', nodeId: 'helps' }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    relevant: false,
    line: WARM_ACK,
    clarifyingPrompt: prompt,
  });
});

test('a live care answer overrides a model not-relevant verdict', async () => {
  const demo = DemoContext.fromBindings(liveShell(), async () =>
    chatEnvelope({
      relevant: false,
      line: WARM_ACK,
      clarifyingPrompt: 'I want to make sure I understand. What does that have to do with Sunday?',
    }),
  );
  const response = await demo.handle(
    post('/v1/drafts/acknowledgement', { answer: 'A quiet corner', nodeId: 'helps' }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    relevant: true,
    line: WARM_ACK,
    clarifyingPrompt: '',
  });
});

test('a live quiet corner and cheese muffin answer overrides a model not-relevant verdict', async () => {
  const demo = DemoContext.fromBindings(liveShell(), async () =>
    chatEnvelope({
      relevant: false,
      line: WARM_ACK,
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
    line: WARM_ACK,
    clarifyingPrompt: '',
  });
});

test('short uncertain or no answers override a model not-relevant verdict', async () => {
  const demo = DemoContext.fromBindings(liveShell(), async () =>
    chatEnvelope({
      relevant: false,
      line: WARM_ACK,
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
      { relevant: true, line: WARM_ACK, clarifyingPrompt: '' },
      answer,
    );
  }
});

test('lol idk pizza stays not relevant and keeps an unlabeled clarifying prompt', async () => {
  const clarifyingPrompt = 'I want to make sure I understand. What does that have to do with Sunday?';
  const demo = DemoContext.fromBindings(liveShell(), async () =>
    chatEnvelope({ relevant: false, line: WARM_ACK, clarifyingPrompt }),
  );
  const response = await demo.handle(
    post('/v1/drafts/acknowledgement', { answer: 'lol idk pizza', nodeId: 'helps' }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    relevant: false,
    line: WARM_ACK,
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
      chatEnvelope({ relevant: false, line: WARM_ACK, clarifyingPrompt }),
    );
    const response = await demo.handle(
      post('/v1/drafts/acknowledgement', { answer: 'pizza rocket sandwich', nodeId: 'helps' }),
    );
    assert.equal(response.status, 200, clarifyingPrompt);
    assert.deepEqual(
      await response.json(),
      { relevant: false, line: WARM_ACK, clarifyingPrompt: canned },
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
      chatEnvelope({ relevant: false, line: WARM_ACK, clarifyingPrompt }),
    );
    const response = await demo.handle(
      post('/v1/drafts/acknowledgement', { answer: 'pizza rocket sandwich', nodeId: 'helps' }),
    );
    assert.equal(response.status, 200, clarifyingPrompt);
    assert.deepEqual(await response.json(), {
      relevant: false,
      line: WARM_ACK,
      clarifyingPrompt,
    });
  }
});

test('a live answer with a number keeps the model relevant verdict', async () => {
  const demo = DemoContext.fromBindings(liveShell(), async () =>
    chatEnvelope({ relevant: true, line: WARM_ACK, clarifyingPrompt: '' }),
  );
  const response = await demo.handle(
    post('/v1/drafts/acknowledgement', { answer: 'Gets 2 breaks', nodeId: 'helps' }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    relevant: true,
    line: WARM_ACK,
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
      return chatEnvelope({ relevant: true, line: WARM_ACK, clarifyingPrompt: '' });
    });
    const response = await demo.handle(
      post('/v1/drafts/acknowledgement', { answer: 'Picture cards.', nodeId: 'communication' }),
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      relevant: true,
      line: WARM_ACK,
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
      line: PARENT_FALLBACK,
      clarifyingPrompt: '',
      fallbackReason: 'upstream_error',
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
  const body = (await story.json()) as { title: string; pages: StoryPages };
  const text = prose(body.pages);
  assert.equal(body.title, 'Sunday with Rowan');
  assert.equal(text.includes('TICK-QUIET-ROOM'), false);
  assert.equal(text.includes('TICK-MEDICAL'), false);
  assert.equal(text.includes(harbor.name), true);
  assert.equal(text.includes(harbor.room), true);
  assert.equal(text.includes(harbor.leader), true);
  assert.equal(
    storySafety({ title: body.title, body: text }, { childName: 'Rowan', church: harbor, lines: [{ text: sensory.text }] }),
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
  assert.equal(note.body, `Sunday went well for Rowan.${LEADER_SIGN}`);
  assert.equal(note.body.includes('TICK-AFTER-SUNDAY'), false);
  assert.equal(note.body.includes('Jordan Ellis'), false);
  assert.equal(note.body.includes('['), false);
  assert.notEqual(note.body, 'TICK-AFTER-SUNDAY');
  assert.notEqual(note.body, 'TICK-AFTER-SUNDAY\nRowan');
  assert.notEqual(note.body.replace(/\s+/g, ''), 'TICK-AFTER-SUNDAYRowan');
  const redeemer = await demo.handle(
    post('/v1/drafts/sunday-update', sunday('TICK-AFTER-SUNDAY', 'Rowan', { church: 'Church of the Redeemer' })),
  );
  assert.equal(redeemer.status, 200);
  assert.deepEqual(await redeemer.json(), {
    body: 'Sunday went well for Rowan.\n\nMs. Dana\nChurch of the Redeemer',
  });
});

test('parseSocialStory rejects a bad page instead of mixing in a template page', () => {
  assert.throws(() => parseSocialStory({ title: 'Sunday', body: labelStory }, rowanInput), SchemaRejected);
  const pages = personalPages();
  assert.throws(
    () =>
      parseSocialStory(
        {
          title: 'Sunday with Rowan',
          pages: {
            ...pages,
            helper: "{ 'loves': 'Soft music' }",
            desk: labelStory,
          },
        },
        rowanInput,
      ),
    (error: unknown) => rejectedReason(error) === 'schema',
  );
  assert.throws(
    () =>
      parseSocialStory(
        {
          title: 'Sunday with Rowan',
          pages: {
            ...pages,
            helper: "{ 'loves': 'Soft music' }",
            desk: labelStory,
            arrive: 'The room has "sensory": quiet corners.',
          },
        },
        rowanInput,
      ),
    (error: unknown) => rejectedReason(error) === 'schema',
  );
});

test('parseSocialStory accepts a personal seven-page story', () => {
  const pages = personalPages();
  assert.deepEqual(parseSocialStory({ title: 'Sunday with Rowan', pages }, rowanInput), {
    title: 'Sunday with Rowan',
    pages,
  });
});

test('parseSocialStory rejects a care-plan title', () => {
  assert.throws(
    () => parseSocialStory({ title: "Rowan's Sunday Plan", pages: personalPages() }, rowanInput),
    SchemaRejected,
  );
});

test('parseSocialStory rejects an empty page and keeps only the first two sentences', () => {
  const pages = personalPages();
  assert.throws(
    () => parseSocialStory({ title: 'Sunday with Rowan', pages: { ...pages, pickup: '   ' } }, rowanInput),
    SchemaRejected,
  );
  const doors =
    'Rowan walks through the front doors at Example Harbor Fellowship and pauses. A greeter smiles and says hello to Rowan there. Rowan sits down.';
  const trimmed = parseSocialStory({ title: 'Sunday with Rowan', pages: { ...pages, doors } }, rowanInput);
  assert.equal(
    trimmed.pages.doors,
    'Rowan walks through the front doors at Example Harbor Fellowship and pauses. A greeter smiles and says hello to Rowan there.',
  );
});

test('parseSocialStory allows a parent-named object and rejects an invented seat', () => {
  const lines = [
    { text: 'Rowan loves Shelly the turtle and quiet trains.' },
    { text: 'They like a softer seat and bright lights.' },
    { text: 'A doorway and a Disney story help Rowan.' },
  ];
  const input = { childName: 'Rowan', church: harbor, lines };
  const pages = personalPages();
  pages.helper = 'Rowan can hold Shelly the turtle during the quiet activity in the Harbor Room today.';
  assert.equal(parseSocialStory({ title: 'Sunday with Rowan', pages }, input).pages.helper, pages.helper);
  const held = { ...pages, quiet: 'Rowan can sit in a soft seat away from the bright lights in the Harbor Room.' };
  assert.equal(parseSocialStory({ title: 'Sunday with Rowan', pages: held }, input).pages.quiet, held.quiet);
  assert.throws(
    () =>
      parseSocialStory(
        {
          title: 'Sunday with Rowan',
          pages: { ...pages, quiet: 'Rowan sits in a soft seat away from the bright lights in the Harbor Room today.' },
        },
        input,
      ),
    (error: unknown) => rejectedReason(error) === 'church_detail',
  );
});

test('parseSocialStory rejects a story with fewer than 40 words or fewer than two child nouns', () => {
  const thin = personalPages();
  for (const beat of STORY_BEATS) thin[beat] = 'Rowan waves.';
  thin.helper = 'Rowan sees Disney.';
  thin.quiet = 'Rowan sees a doorway.';
  assert.throws(() => parseSocialStory({ title: 'Sunday with Rowan', pages: thin }, rowanInput), SchemaRejected);
  const long = personalPages();
  for (const beat of STORY_BEATS) {
    long[beat] = 'Rowan walks along with a grown-up and smiles at the morning.';
  }
  assert.throws(() => parseSocialStory({ title: 'Sunday with Rowan', pages: long }, rowanInput), SchemaRejected);
});

test('a story page longer than 1200 characters is kept', () => {
  const quiet = longQuietPage();
  assert.equal(quiet.length > 1200 && quiet.length <= SUNDAY_STORY_PAGE_MAX, true);
  const pages = socialStorySchema.properties.pages;
  assert.equal(pages.type, 'object');
  if (pages.type !== 'object') return;
  const cap = pages.properties.quiet;
  assert.equal(cap?.type, 'string');
  if (cap?.type !== 'string') return;
  assert.equal(cap.maxLength, SUNDAY_STORY_PAGE_MAX);
  const story = { ...personalPages(), quiet };
  const parsed = parseSocialStory({ title: 'Sunday with Rowan', pages: story }, rowanInput);
  assert.equal(parsed.pages.quiet, quiet);
  assert.equal(pageSentences(parsed.pages.quiet) <= 2, true);
});

test('a long Juniper story passes when the pages use her answers', () => {
  for (const [field, answer] of Object.entries(juniperAnswers)) {
    assert.equal(answer.length >= 800 && answer.length <= 1900, true, field);
    assert.equal(answer.includes('\n\n'), true, field);
  }
  assert.equal(juniperAnswers.allergies.toLowerCase().includes('gluten'), true);
  for (const field of ['loves', 'overwhelms', 'whatHelps', 'communication', 'sensory'] as const) {
    assert.equal(juniperAnswers[field].toLowerCase().includes('gluten'), false, field);
  }
  const lines = [
    { field: 'loves', text: juniperAnswers.loves },
    { field: 'overwhelms', text: juniperAnswers.overwhelms },
    { field: 'whatHelps', text: juniperAnswers.whatHelps },
    { field: 'communication', text: juniperAnswers.communication },
    { field: 'sensory', text: juniperAnswers.sensory },
  ];
  const pages: StoryPages = {
    arrive:
      'Juniper goes to Example Harbor Fellowship with a grown-up on Sunday morning. Juniper can hold Pip the fox on the way in.',
    doors:
      'Juniper walks in the front doors at Example Harbor Fellowship and pauses. A greeter smiles and says hello to Juniper there.',
    desk: 'At the welcome desk, Juniper checks in and gets a name tag. Juniper can wait there with a grown-up before class.',
    room: 'Juniper looks at a picture schedule in the hall before the Harbor Room. The picture schedule shows what is next for Juniper.',
    helper:
      'A helper stays nearby in the Harbor Room with Juniper. Juniper can use a weighted lap pad while the helper stays close.',
    quiet: 'Hand dryers are loud in the hall outside the Harbor Room. Juniper can stand where the hand dryers are far away.',
    pickup:
      'When the morning is over, Juniper goes home with a grown-up and Pip the fox. Juniper can say a quiet goodbye first.',
  };
  const parsed = parseSocialStory({ title: `Sunday with ${juniperName}`, pages }, { childName: juniperName, church: harbor, lines });
  assert.deepEqual(parsed.pages, pages);
  const joined = prose(parsed.pages);
  const details = ['Pip', 'lap pad', 'picture schedule', 'hand dryers'].filter((detail) => joined.includes(detail));
  assert.equal(details.length >= 3, true);
  for (const beat of STORY_BEATS) {
    const sentences = pageSentences(parsed.pages[beat]);
    assert.equal(sentences >= 1 && sentences <= 2, true, beat);
  }
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

test('parseSundayUpdate drops a leading leader-at-church prefix and signs off once', () => {
  const notes = 'TICK-AFTER-SUNDAY';
  const prose = `Sunday went well. ${notes} The quiet seat helped.`;
  const sign = { leader: 'Ms. Dana', church: 'Example Harbor Fellowship' };
  const prefixed = `Ms. Dana at Example Harbor Fellowship: ${prose}`;
  const lined = `Ms. Dana at Example Harbor Fellowship:\n${prose}`;
  assert.equal(parseSundayUpdate({ body: prefixed }, notes, 'Juniper', sign).body, `${prose}${LEADER_SIGN}`);
  assert.equal(parseSundayUpdate({ body: lined }, notes, 'Juniper', sign).body, `${prose}${LEADER_SIGN}`);
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

test('parseSundayUpdate keeps another person and drops a closing on the leader', () => {
  const notes = 'TICK-AFTER-SUNDAY';
  const prose = 'Sunday went well. The quiet seat helped.';
  const sign = { leader: 'Ms. Dana', church: 'Example Harbor Fellowship' };
  const volunteer = parseSundayUpdate({ body: `${prose}\nJordan Ellis` }, notes, 'Rowan', sign);
  assert.equal(volunteer.body, `${prose}\nJordan Ellis${LEADER_SIGN}`);
  const warmly = parseSundayUpdate({ body: `${prose}\nWarmly,\nMs. Dana` }, notes, 'Rowan', sign);
  assert.equal(warmly.body, `${prose}${LEADER_SIGN}`);
});

test('a Sunday note keeps a room and a thanks line', () => {
  const notes = 'TICK-AFTER-SUNDAY';
  const prose = 'Sunday went well. The quiet seat helped.';
  const sign = { leader: 'Ms. Dana', church: 'Example Harbor Fellowship' };
  for (const line of ['Harbor Room', 'Thanks.']) {
    const note = parseSundayUpdate({ body: `${prose}\n${line}` }, notes, 'Rowan', sign);
    assert.equal(note.body, `${prose}\n${line}${LEADER_SIGN}`);
  }
});

test('a copied leader or church line is signed once', () => {
  const notes = 'TICK-AFTER-SUNDAY';
  const prose = 'Sunday went well. The quiet seat helped.';
  const sign = { leader: 'Ms. Dana', church: 'Example Harbor Fellowship' };
  const copies = [
    `${prose}\nLeader: Ms. Dana`,
    `${prose}\nMs. Dana,`,
    `${prose}\nChurch: Example Harbor Fellowship`,
    `${prose}\nFrom: Ms. Dana`,
    `${prose}\nms. dana\nexample harbor fellowship`,
    prose,
    `${prose}${LEADER_SIGN}`,
  ];
  for (const body of copies) {
    assert.equal(parseSundayUpdate({ body }, notes, 'Rowan', sign).body, `${prose}${LEADER_SIGN}`);
  }
});

test('a church name with a small word is signed once', () => {
  const notes = 'TICK-AFTER-SUNDAY';
  const prose = 'Sunday went well. The quiet seat helped.';
  for (const church of ['Church of the Harbor', 'Church of the Redeemer']) {
    const sign = { leader: 'Ms. Dana', church };
    const copied = parseSundayUpdate({ body: `${prose}\n${church}` }, notes, 'Rowan', sign);
    const exact = parseSundayUpdate({ body: `${prose}\n\nMs. Dana\n${church}` }, notes, 'Rowan', sign);
    const signed = `${prose}\n\nMs. Dana\n${church}`;
    assert.equal(copied.body, signed);
    assert.equal(exact.body, signed);
  }
});

test('a closing between the leader and the church is signed once', () => {
  const notes = 'TICK-AFTER-SUNDAY';
  const prose = 'Sunday went well. The quiet seat helped.';
  const leader = 'Ms. Dana';
  const between = [
    { church: 'Example Harbor Fellowship', word: 'Warmly,' },
    { church: 'Church of the Harbor', word: 'Love,' },
    { church: 'Church of the Redeemer', word: 'From,' },
    { church: 'Church of the Harbor', word: 'Thanks,' },
  ];
  for (const item of between) {
    const body = `${prose}\n${leader}\n${item.word}\n${item.church}`;
    const signed = `${prose}\n\n${leader}\n${item.church}`;
    assert.equal(parseSundayUpdate({ body }, notes, 'Rowan', { leader, church: item.church }).body, signed);
  }
  const churchFirst = `${prose}\nChurch of the Harbor\nThanks,\n${leader}`;
  assert.equal(
    parseSundayUpdate({ body: churchFirst }, notes, 'Rowan', { leader, church: 'Church of the Harbor' }).body,
    `${prose}\n\n${leader}\nChurch of the Harbor`,
  );
});

test("a church name that drops an apostrophe is signed once", () => {
  const notes = 'TICK-AFTER-SUNDAY';
  const prose = 'Sunday went well. The quiet seat helped.';
  const sign = { leader: 'Ms. Dana', church: "St. John's" };
  assert.equal(
    parseSundayUpdate({ body: `${prose}\nSt. Johns` }, notes, 'Rowan', sign).body,
    `${prose}\n\nMs. Dana\nSt. John's`,
  );
});

test('a closing word stays unless it sits on the leader or the church', () => {
  const notes = 'TICK-AFTER-SUNDAY';
  const prose = 'Sunday went well. The quiet seat helped.';
  const sign = { leader: 'Ms. Dana', church: 'Example Harbor Fellowship' };
  for (const word of ['Love,', 'From,', 'Blessings,', 'Thanks,', 'Warmly,']) {
    const alone = parseSundayUpdate({ body: `${prose}\n${word}` }, notes, 'Rowan', sign);
    assert.equal(alone.body, `${prose}\n${word}${LEADER_SIGN}`);
    const above = parseSundayUpdate({ body: `${prose}\n${word}\nMs. Dana` }, notes, 'Rowan', sign);
    assert.equal(above.body, `${prose}${LEADER_SIGN}`);
  }
});

test('a Sunday sentence that starts with Love or From stays', () => {
  const notes = 'TICK-AFTER-SUNDAY';
  const sign = { leader: 'Ms. Dana', church: 'Example Harbor Fellowship' };
  const love = 'Sunday went well. The quiet seat helped.\nLove the quiet corner.';
  assert.equal(parseSundayUpdate({ body: love }, notes, 'Rowan', sign).body, `${love}${LEADER_SIGN}`);
  const from = 'From the first song, Rowan sat quietly.';
  assert.equal(parseSundayUpdate({ body: from }, notes, 'Rowan', sign).body, `${from}${LEADER_SIGN}`);
});

test('a story that is not seven pages retries once and then uses the template', async () => {
  const fallback = fallbackSocialStory({ childName: 'Rowan', church: harbor, lines: [] });
  const dict = await generated(
    '/v1/drafts/social-story',
    { lines: [sensory], childName: 'Rowan', church: harbor },
    { title: 'Sunday', body: "{ 'loves': 'Soft music' }" },
  );
  assert.equal(dict.status, 200);
  assert.equal(dict.calls, 2);
  assert.deepEqual(dict.payload, {
    ...fallback,
    fallbackReason: 'schema',
    model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  });
  const missingName = await generated(
    '/v1/drafts/social-story',
    { lines: [sensory], childName: 'Al', church: harbor },
    { title: 'Sunday with Rowan', pages: recordedPages() },
  );
  assert.equal(missingName.status, 200);
  assert.equal(missingName.calls, 2);
  assert.deepEqual(missingName.payload, {
    ...fallbackSocialStory({ childName: 'Al', church: harbor, lines: [] }),
    fallbackReason: 'safety_unknown_name',
    model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  });
  const pages = recordedPages();
  const clean = await generated(
    '/v1/drafts/social-story',
    { lines: [sensory], childName: 'Rowan', church: harbor },
    { title: 'Sunday with Rowan', pages },
  );
  assert.equal(clean.status, 200);
  assert.equal(clean.calls, 1);
  assert.deepEqual(clean.payload, {
    title: 'Sunday with Rowan',
    pages,
    source: 'model',
    model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  });
});

test('a banned story page retries once and a care-plan title still falls back', async () => {
  const template = templateStoryPages(harbor);
  const repaired = await generated(
    '/v1/drafts/social-story',
    { lines: [sensory], childName: 'Rowan', church: harbor },
    {
      title: 'Sunday with Rowan',
      pages: {
        ...recordedPages(),
        helper: 'Rowan will be happy in the Harbor Room during the quiet activity with the helpers nearby today.',
      },
    },
  );
  assert.equal(repaired.status, 200);
  assert.equal(repaired.calls, 2);
  assert.deepEqual(repaired.payload, {
    title: 'Sunday with Rowan',
    pages: template,
    source: 'fallback',
    fallbackReason: 'safety',
    model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  });
  const planned = await generated(
    '/v1/drafts/social-story',
    { lines: [sensory], childName: 'Rowan', church: harbor },
    { title: "Rowan's Sunday Plan", pages: recordedPages() },
  );
  assert.equal(planned.status, 200);
  assert.equal(planned.calls, 2);
  assert.deepEqual(planned.payload, {
    ...fallbackSocialStory({ childName: 'Rowan', church: harbor, lines: [] }),
    fallbackReason: 'safety_banned_word',
    model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  });
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
  assert.equal(volunteer.calls, 1);
  assert.deepEqual(volunteer.payload, { body: `${prose}\nJordan Ellis${LEADER_SIGN}` });
  const warmly = await generated('/v1/drafts/sunday-update', sunday(notes), {
    body: `${prose}\nWarmly,\nMs. Dana`,
  });
  assert.equal(warmly.status, 200);
  assert.equal(warmly.calls, 1);
  assert.deepEqual(warmly.payload, { body: `${prose}${LEADER_SIGN}` });
  const sentence = 'From the first song, Rowan sat quietly.';
  const from = await generated('/v1/drafts/sunday-update', sunday(notes), { body: sentence });
  assert.equal(from.status, 200);
  assert.equal(from.calls, 1);
  assert.deepEqual(from.payload, { body: `${sentence}${LEADER_SIGN}` });
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
  assert.equal(user.includes('Hard moment (describe gently, never name the word): A crowded doorway overwhelms Rowan.'), true);
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
    'pages has arrive, doors, desk, room, helper, quiet, and pickup.',
    'Each page is one or two sentences and about 15 to 30 words, even when the answers are short.',
    'The room page can mention the Sunday schedule. Do not list times or invent schedule items.',
    'At least 3 pages use a detail from Loves, What helps, Communication, or Sensory.',
    'One page is a gentle hard moment and never uses the banned tone words.',
    'Parent-named objects are allowed with can or may, and nothing is promised about the church.',
    'The title is a varied story title for this child and this morning, never a Plan or Supporting title.',
    'Use ordinary spoken English, and put the before a room name.',
    'Describe only what the church plan says will happen. Do not add a seat, a kind of seat, a sound level, a song, or an activity the plan does not name. Do not promise that anything will be ready.',
    'The pickup page ends with one warm, calm, reassuring line for the child. It welcomes them and does not promise anything. Do not add a line or a field after the JSON.',
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

test('storySafety accepts a story longer than 90 words and eight sentences', () => {
  const sentences = [
    'On Sunday, Rowan goes to Example Harbor Fellowship.',
    'Rowan walks to Harbor Room.',
    'Ms. Dana says hello.',
    'Rowan sits.',
    'Rowan listens.',
    'Rowan smiles.',
    'Rowan waves.',
    'Rowan claps.',
    'Rowan reads a Disney story.',
    'Rowan sees a doorway.',
    'Rowan goes home.',
  ];
  assert.equal(storySafety({ title: 'Sunday with Rowan', body: sentences.join(' ') }, rowanInput), true);
  const sits = `Rowan ${'sits '.repeat(100)}quietly.`;
  assert.equal(storySafety({ title: 'Sunday with Rowan', body: sits }, rowanInput), true);
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
  const body = (await response.json()) as { title: string; pages: StoryPages; source: string };
  const text = prose(body.pages);
  assert.equal(body.source, 'fallback');
  assert.equal(text.includes('Example Harbor Fellowship'), true);
  assert.equal(storySafety({ title: body.title, body: text }, { childName: 'Rowan', church: harbor, lines: [] }), true);
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
  assert.equal(calls, 2);
  const text = await response.text();
  assert.equal(text.includes('GATEWAY-BODY-SHOULD-NOT-LEAK'), false);
  assert.deepEqual(JSON.parse(text), {
    ...fallbackSocialStory({ childName: 'Rowan', church: harbor, lines: [] }),
    fallbackReason: 'upstream_error',
    model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  });
});

test('the Sunday fallback is the seven template pages', () => {
  const story = fallbackSocialStory({ childName: 'Rowan', church: harbor, lines: [] });
  assert.equal(story.source, 'fallback');
  assert.deepEqual(story.pages, templateStoryPages(harbor));
  assert.equal(
    storySafety({ title: story.title, body: prose(story.pages) }, { childName: 'Rowan', church: harbor, lines: rowanLines }),
    true,
  );
  assert.equal(story.pages.pickup.includes('pick you up'), true);
  assert.equal(story.pages.desk.includes('welcome desk'), true);
  assert.equal(story.pages.room.includes('the Harbor Room'), true);
  assert.equal(story.pages.helper.includes('Ms. Dana'), true);
});

test('a long church plan keeps every Sunday sentence in the fallback', async () => {
  const plan = `${'Sing a short song and sit quietly. '.repeat(50)}End.`.slice(0, 1800);
  const church = { ...harbor, plan };
  const demo = DemoContext.fromBindings(liveShell(), async () => new Response('down', { status: 502 }));
  const response = await demo.handle(socialStory({ lines: [sensory], childName: 'Rowan', church }));
  assert.equal(response.status, 200);
  const payload = (await response.json()) as { title: string; pages: StoryPages; source: string };
  assert.equal(payload.source, 'fallback');
  assert.deepEqual(payload.pages, templateStoryPages(church));
  assert.equal(payload.pages.quiet.includes('there is a quiet spot in the room.'), true);
  assert.equal(payload.pages.room.length <= SUNDAY_STORY_PAGE_MAX, true);
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
  const body = (await response.json()) as { title: string; pages: StoryPages; source: string };
  const text = prose(body.pages);
  assert.equal(body.title, 'Sunday with Rowan');
  assert.equal(body.source, 'model');
  assert.equal(text.includes('Peanut'), false);
  assert.equal(text.includes('inhaler'), false);
  assert.equal(text.includes('hurt'), false);
  assert.equal(text.includes('run off'), false);
  assert.equal(
    storySafety(
      { title: body.title, body: text },
      {
        childName: 'Rowan',
        church: harbor,
        lines: lines.map((line) => ({ text: line.text })),
      },
    ),
    true,
  );
});

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
    const body = (await response.json()) as { title: string; pages: StoryPages };
    const told = prose(body.pages);
    assert.equal(body.title, 'Sunday with Rowan');
    assert.equal(told.includes(text), false);
    assert.equal(told.includes(harbor.name), true);
    assert.equal(told.includes(harbor.room), true);
    assert.equal(told.includes(harbor.leader), true);
    assert.equal(storySafety({ title: body.title, body: told }, { childName: 'Rowan', church: harbor, lines: [{ text }] }), true);
  }

  const hidden = await demo.handle(socialStory({ lines: [sensory], childName: 'Rowan' }));
  assert.equal(hidden.status, 200);
  const hiddenBody = (await hidden.json()) as { pages: StoryPages };
  const hiddenText = prose(hiddenBody.pages);
  assert.equal(hiddenText.includes('TICK-QUIET-ROOM'), false);
  assert.equal(hiddenText.includes('TICK-MEDICAL'), false);

  const shown = await demo.handle(
    socialStory({
      lines: [{ field: 'medical', label: 'Medical / health notes', text: 'TICK-MEDICAL' }],
      childName: 'Rowan',
    }),
  );
  const shownBody = (await shown.json()) as { pages: StoryPages };
  assert.equal(prose(shownBody.pages).includes('TICK-MEDICAL'), false);

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
    return chatEnvelope({ line: WARM_ACK });
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
    if (name === 'social_story') return chatEnvelope({ title: 'Sunday with Rowan', pages: recordedPages() });
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

const LIVE_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

const rowanRequestLines = [
  { field: 'loves', label: 'Loves', text: 'Rowan loves Disney stories and quiet songs.' },
  { field: 'overwhelms', label: 'Overwhelms', text: 'A crowded doorway overwhelms Rowan.' },
  { field: 'whatHelps', label: 'What helps', text: 'A quiet break helps Rowan settle.' },
  { field: 'communication', label: 'Communication', text: 'Rowan points and uses a few words.' },
  { field: 'sensory', label: 'Sensory', text: 'Rowan needs a softer seat away from bright lights.' },
] as const;

function rawChat(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

async function storyFromModel(content: string): Promise<{ status: number; body: Record<string, unknown>; logs: string[] }> {
  const logs: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    logs.push(args.map(String).join(' '));
  };
  try {
    const demo = DemoContext.fromBindings(liveShell(), async () => rawChat(content));
    const response = await demo.handle(socialStory({ lines: [...rowanRequestLines], childName: 'Rowan' }));
    return { status: response.status, body: (await response.json()) as Record<string, unknown>, logs };
  } finally {
    console.error = original;
  }
}

test('a social story asks for enough tokens and names the model that wrote it', async () => {
  const calls: GatewayCall[] = [];
  const demo = DemoContext.fromBindings(liveShell(), recordingFetch(calls));
  const response = await demo.handle(socialStory({ lines: [...rowanRequestLines], childName: 'Rowan' }));
  assert.equal(response.status, 200);
  const body = (await response.json()) as { source: string; model?: string };
  assert.equal(body.source, 'model');
  assert.equal(body.model, LIVE_MODEL);
  assert.equal(calls[0]?.body.max_tokens !== undefined && calls[0].body.max_tokens >= 1024, true);
  const system = systemText(calls[0]);
  assert.equal(system.includes('The pickup page ends with one warm, calm, reassuring line for the child.'), true);
  assert.equal(system.includes('End with one warm, calm, reassuring line'), false);
});

test('fenced, trailed, and truncated story JSON still becomes the personal story', async () => {
  const pages = personalPages();
  const story = { title: 'Sunday with Rowan', pages };
  const raw = JSON.stringify(story);
  const fenced = await storyFromModel(`Here is the story:\n\`\`\`json\n${raw}\n\`\`\`\nYou are welcome here, Rowan.`);
  assert.equal(fenced.status, 200);
  assert.equal(fenced.body.source, 'model');
  assert.equal(fenced.body.model, LIVE_MODEL);
  assert.deepEqual(fenced.body.pages, pages);
  const trailed = await storyFromModel(`${raw}\nYou are welcome here, Rowan.`);
  assert.equal(trailed.body.source, 'model');
  assert.deepEqual(trailed.body.pages, pages);
  const pickupValue = JSON.stringify(pages.pickup);
  const pickupAt = raw.lastIndexOf(pickupValue);
  assert.equal(pickupAt > 0, true);
  const cut = raw.slice(0, pickupAt + pickupValue.length);
  const truncated = await storyFromModel(cut);
  assert.equal(truncated.body.source, 'model');
  const kept = truncated.body.pages as StoryPages;
  assert.equal(kept.helper, pages.helper);
  assert.equal(kept.quiet, pages.quiet);
  assert.equal(kept.pickup, pages.pickup);
  assert.equal(/[.!?]["'”’]*$/u.test(kept.pickup.trim()), true);
});

test('a story cut off before all seven pages falls back', async () => {
  const pages = personalPages();
  const raw = JSON.stringify({ title: 'Sunday with Rowan', pages });
  const template = templateStoryPages(harbor);
  const cuts = [
    raw.slice(0, raw.indexOf('"desk":')),
    raw.slice(0, raw.indexOf('"quiet":')),
    raw.slice(0, raw.indexOf('"pickup":')),
  ];
  for (const cut of cuts) {
    assert.equal(cut.length > 0 && cut.length < raw.length, true);
    const result = await storyFromModel(cut);
    assert.equal(result.status, 200);
    assert.equal(result.body.source, 'fallback');
    assert.equal(result.body.fallbackReason, 'truncated');
    assert.deepEqual(result.body.pages, template);
    assert.equal(result.logs.some((line) => line.includes('"fallbackReason":"truncated"')), true);
    assert.equal(result.logs.some((line) => line.includes(pages.helper)), false);
  }
  for (const beat of STORY_BEATS) {
    const key = `"${beat}":"`;
    const at = raw.indexOf(key);
    const mid = raw.slice(0, at + key.length + 8);
    const result = await storyFromModel(mid);
    assert.equal(result.body.source, 'fallback', beat);
    assert.equal(result.body.fallbackReason, 'truncated', beat);
    assert.deepEqual(result.body.pages, template, beat);
  }
});

test('an extra closing field is ignored and a third sentence stays off the page', () => {
  const pages = personalPages();
  const withClosing = parseSocialStory(
    { title: 'Sunday with Rowan', pages, closing: 'You are welcome here.' },
    rowanInput,
  );
  assert.equal(withClosing.pages.helper, pages.helper);
  const warm =
    'Rowan can hold a Disney story near the doorway in the Harbor Room. Rowan smiles at the doorway and waits with a grown-up. You are welcome here.';
  const trimmed = parseSocialStory(
    { title: 'Sunday with Rowan', pages: { ...pages, doors: warm } },
    rowanInput,
  );
  assert.equal(
    trimmed.pages.doors,
    'Rowan can hold a Disney story near the doorway in the Harbor Room. Rowan smiles at the doorway and waits with a grown-up.',
  );
  const quoted = { ...pages, pickup: 'Rowan can leave with a grown-up after a quiet goodbye at the Harbor Room today."' };
  assert.equal(
    parseSocialStory({ title: 'Sunday with Rowan', pages: quoted }, rowanInput).pages.pickup,
    quoted.pickup,
  );
});

test('a short name and a hedged seat survive, and safety reasons stay distinct', () => {
  const lines = [
    { field: 'loves', text: 'Pip the fox' },
    { field: 'whatHelps', text: 'a lap pad' },
  ];
  const pages = {
    arrive:
      'Juniper and a grown-up go to Example Harbor Fellowship on Sunday morning. Juniper can hold Pip the fox.',
    doors:
      'Juniper walks through the front doors at Example Harbor Fellowship and pauses. A greeter smiles and says hello to Juniper there.',
    desk: 'At the welcome desk Juniper checks in and picks up a name tag. Juniper can point to the tag and wait with a grown-up.',
    room: 'Juniper goes to the Harbor Room for a short welcome and a quiet activity. Juniper can stay near a doorway if the room is busy.',
    helper: 'Ms. Dana and the helpers are in the Harbor Room with Juniper. Juniper can hold Pip the fox while the helpers stay nearby.',
    quiet: 'Juniper can use a lap pad away from the bright lights in the Harbor Room. A quiet break helps Juniper settle and look around.',
    pickup:
      'When the morning is over a grown-up comes back to the Harbor Room for Juniper. Juniper can leave with that grown-up after a quiet goodbye.',
  };
  const named = parseSocialStory(
    { title: 'Sunday with Juniper', pages },
    { childName: 'Juniper', church: harbor, lines },
  );
  assert.equal(named.pages.helper, pages.helper);
  assert.equal(named.pages.quiet, pages.quiet);
  const hedged = personalPages();
  hedged.quiet = 'Rowan could sit in a softer seat away from the bright lights in the Harbor Room.';
  assert.equal(parseSocialStory({ title: 'Sunday with Rowan', pages: hedged }, rowanInput).pages.quiet, hedged.quiet);
  assert.throws(
    () =>
      parseSocialStory(
        {
          title: 'Sunday with Rowan',
          pages: { ...hedged, quiet: 'Rowan sits in a soft seat away from the bright lights in the Harbor Room today.' },
        },
        rowanInput,
      ),
    (error: unknown) => rejectedReason(error) === 'church_detail',
  );
  assert.throws(
    () => parseSocialStory({ title: 'Allergy Sunday with Rowan', pages: personalPages() }, rowanInput),
    (error: unknown) => rejectedReason(error) === 'safety_allergy',
  );
  const thin = personalPages();
  for (const beat of STORY_BEATS) thin[beat] = 'Rowan waves.';
  assert.throws(
    () => parseSocialStory({ title: 'Sunday with Rowan', pages: thin }, rowanInput),
    (error: unknown) => rejectedReason(error) === 'too_short',
  );
  const generic = personalPages();
  for (const beat of STORY_BEATS) {
    generic[beat] = 'Rowan walks along with a grown-up and smiles at the sunny morning outside the building.';
  }
  assert.throws(
    () => parseSocialStory({ title: 'Sunday with Rowan', pages: generic }, rowanInput),
    (error: unknown) => rejectedReason(error) === 'child_detail_min',
  );
});

function rejectedReason(error: unknown): string | undefined {
  if (!(error instanceof SchemaRejected)) return undefined;
  const record = error as SchemaRejected & { fallbackReason?: string };
  return record.fallbackReason;
}

test('a rejected story reports a fallback reason and does not log the model text', async () => {
  const token = 'TOKEN-MODEL-OUTPUT';
  const result = await storyFromModel(`not json ${token}`);
  assert.equal(result.status, 200);
  assert.equal(result.body.source, 'fallback');
  assert.equal(result.body.fallbackReason, 'invalid_json');
  assert.equal(result.body.model, LIVE_MODEL);
  assert.equal(JSON.stringify(result.body).includes(token), false);
  assert.equal(result.logs.some((line) => line.includes('"fallbackReason":"invalid_json"')), true);
  assert.equal(result.logs.some((line) => line.includes(token)), false);
});

test('a long answer acknowledgement keeps a quoted detail and sends the whole answer', async () => {
  const answer = juniperAnswers.loves;
  assert.equal(answer.length > 1500, true);
  const line = 'The fox is named Pip, and that can help the volunteers connect on Sunday morning.';
  let told = '';
  const demo = DemoContext.fromBindings(liveShell(), async (input, init) => {
    const request = new Request(input, init);
    const body = JSON.parse(await request.text()) as { messages?: { role?: string; content?: string }[] };
    const user = body.messages?.find((message) => message.role === 'user')?.content ?? '';
    told = user.slice('Answer: '.length, user.indexOf('\nSection: '));
    return chatEnvelope({ relevant: true, line, clarifyingPrompt: '' });
  });
  const response = await demo.handle(post('/v1/drafts/acknowledgement', { answer, nodeId: 'loves' }));
  assert.equal(response.status, 200);
  assert.equal(told, answer);
  assert.deepEqual(await response.json(), { relevant: true, line, clarifyingPrompt: '' });
});

test('a pronoun in a long-answer acknowledgement falls back with a safety reason', async () => {
  const logs: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    logs.push(args.map(String).join(' '));
  };
  try {
    const demo = DemoContext.fromBindings(liveShell(), async () =>
      chatEnvelope({ relevant: true, line: 'She holds Pip in both hands.', clarifyingPrompt: '' }),
    );
    const response = await demo.handle(
      post('/v1/drafts/acknowledgement', { answer: juniperAnswers.loves, nodeId: 'loves' }),
    );
    assert.equal(response.status, 200);
    const body = (await response.json()) as { line: string; fallbackReason?: string };
    assert.equal(body.line, PARENT_FALLBACK);
    assert.equal(body.fallbackReason, 'safety_pronoun');
    assert.equal(logs.some((line) => line.includes('"fallbackReason":"safety_pronoun"')), true);
    assert.equal(logs.some((line) => line.includes('Pip')), false);
    assert.equal(logs.some((line) => line.includes(juniperAnswers.loves.slice(0, 40))), false);
  } finally {
    console.error = original;
  }
});

test('a welcome desk, a plural toy, and an ordinary special morning stay in the story', async () => {
  const desk = personalPages();
  desk.desk =
    'At the Welcome Desk, Rowan checks in and gets a name tag. Rowan can wait there with a grown-up before class.';
  assert.equal(parseSocialStory({ title: 'Sunday with Rowan', pages: desk }, rowanInput).pages.desk, desk.desk);

  const morning = personalPages();
  morning.arrive =
    'Sunday is a special morning for Rowan at Example Harbor Fellowship. Rowan can hear a quiet song on the way in.';
  assert.equal(
    parseSocialStory({ title: 'Sunday with Rowan', pages: morning }, rowanInput).pages.arrive,
    morning.arrive,
  );

  const air = personalPages();
  air.room = 'The Harbor Room has air conditioning for the morning. Rowan can hear one song and stay for the activity.';
  assert.equal(parseSocialStory({ title: 'Sunday with Rowan', pages: air }, rowanInput).pages.room, air.room);

  const maya = {
    childName: 'Maya',
    church: harbor,
    lines: [{ text: 'Maya loves dinosaurs and digging in the sand table.' }],
  };
  const dino = dayPages(
    'Maya',
    'Maya can hold a dinosaur during the quiet activity in the Harbor Room. Ms. Dana stays nearby while Maya settles.',
    'Maya can dig in the sand table when the Harbor Room feels busy. A quiet spot can help Maya settle there.',
  );
  assert.equal(parseSocialStory({ title: 'Sunday with Maya', pages: dino }, maya).pages.helper, dino.helper);

  const jonah = {
    childName: 'Jonah',
    church: harbor,
    lines: [{ text: 'Jonah loves Lego and building on the floor.' }],
  };
  const bricks = dayPages(
    'Jonah',
    'Jonah can hold Legos during the quiet activity in the Harbor Room. Ms. Dana stays nearby while Jonah settles.',
    'Jonah can build on the floor when the Harbor Room is calm. A quiet activity can help Jonah settle there.',
  );
  assert.equal(parseSocialStory({ title: 'Sunday with Jonah', pages: bricks }, jonah).pages.helper, bricks.helper);

  const drafted = await generated(
    '/v1/drafts/social-story',
    { lines: [...rowanRequestLines], childName: 'Rowan', church: harbor },
    { title: 'Sunday with Rowan', pages: desk },
  );
  assert.equal(drafted.status, 200);
  assert.equal(drafted.calls, 1);
  assert.equal((drafted.payload as { source?: string }).source, 'model');
});

test('allergy, medical, and unknown-name stories report the check that failed', () => {
  assert.throws(
    () => parseSocialStory({ title: 'Allergy Sunday with Rowan', pages: personalPages() }, rowanInput),
    (error: unknown) => rejectedReason(error) === 'safety_allergy',
  );
  assert.throws(
    () => parseSocialStory({ title: 'Autism Sunday with Rowan', pages: personalPages() }, rowanInput),
    (error: unknown) => rejectedReason(error) === 'safety_medical',
  );
  assert.throws(
    () => parseSocialStory({ title: 'Special needs Sunday with Rowan', pages: personalPages() }, rowanInput),
    (error: unknown) => rejectedReason(error) === 'safety_banned_word',
  );
  const named = personalPages();
  named.helper = 'Rowan meets Sam by the door and can wave hello before class in the Harbor Room today.';
  assert.throws(
    () => parseSocialStory({ title: 'Sunday with Rowan', pages: named }, rowanInput),
    (error: unknown) => rejectedReason(error) === 'safety_unknown_name',
  );
  const theo = {
    childName: 'Theo',
    church: harbor,
    lines: [{ text: 'Theo likes a quiet hello and trains.' }],
  };
  const pronoun = dayPages(
    'Theo',
    'Theo can hold a train in the Harbor Room during the quiet activity. His picture can come along while Theo settles.',
    'Theo can look at a train when the Harbor Room is calm. A quiet hello can help Theo settle there.',
  );
  assert.throws(
    () => parseSocialStory({ title: 'Sunday with Theo', pages: pronoun }, theo),
    (error: unknown) => rejectedReason(error) === 'safety_pronoun',
  );
});

test('the story prompt limits each page and a rejected draft is retried with the check name', async () => {
  const parsed = parseSocialStoryRequest({
    childName: 'Rowan',
    church: harbor,
    lines: [{ field: 'loves', label: 'Loves', text: 'Quiet songs.' }],
  });
  assert.ok(parsed);
  if (parsed === null) return;
  const system = socialStoryMessages(parsed).find((message) => message.role === 'system')?.content ?? '';
  for (const phrase of [
    'about 15 to 30 words',
    'Write every page in the third person.',
    'Stay in the third person on every page, including pickup.',
    'Do not invent people or places.',
    'Do not promise or predict a feeling.',
    'Do not hedge a church detail with likely.',
    'The room page can mention the Sunday schedule.',
  ]) {
    assert.equal(system.includes(phrase), true, phrase);
  }

  const bad = personalPages();
  bad.helper = 'Rowan meets Sam by the door and can wave hello before class in the Harbor Room today.';
  const good = personalPages();
  const prompts: string[] = [];
  let calls = 0;
  const demo = DemoContext.fromBindings(liveShell(), async (input, init) => {
    const request = new Request(input, init);
    const body = JSON.parse(await request.text()) as { messages?: { role?: string; content?: string }[] };
    prompts.push(body.messages?.find((message) => message.role === 'system')?.content ?? '');
    const pages = calls === 0 ? bad : good;
    calls += 1;
    return chatEnvelope({ title: 'Sunday with Rowan', pages });
  });
  const response = await demo.handle(socialStory({ lines: [...rowanRequestLines], childName: 'Rowan' }));
  assert.equal(response.status, 200);
  assert.equal(calls, 2);
  const payload = (await response.json()) as { source?: string; pages?: StoryPages };
  assert.equal(payload.source, 'model');
  assert.equal(payload.pages?.helper, good.helper);
  assert.equal(prompts[0]?.includes('safety_unknown_name'), false);
  assert.equal(prompts[1]?.includes('safety_unknown_name'), true);
  assert.equal(prompts[1]?.includes('Sam'), false);
});

test('a long answer keeps one short detail and retries a summary that is too long', async () => {
  const kept = await acknowledgementFrom(
    'The fox is named Pip. She also loves the boat story and holds Pip with her brother before they leave for the bakery.',
    juniperAnswers.loves,
  );
  assert.equal(kept.calls, 1);
  assert.deepEqual(kept.body, { relevant: true, line: 'The fox is named Pip.', clarifyingPrompt: '' });

  const summary =
    'Thank you for sharing the stuffed fox named Pip and the boat story and the bottle caps and the bakery window today once more and again.';
  assert.equal(summary.split(/\s+/u).length > 25, true);
  const short = 'Pip the fox can come along.';
  const prompts: string[] = [];
  let calls = 0;
  const demo = DemoContext.fromBindings(liveShell(), async (input, init) => {
    const request = new Request(input, init);
    const body = JSON.parse(await request.text()) as { messages?: { role?: string; content?: string }[] };
    prompts.push(body.messages?.find((message) => message.role === 'system')?.content ?? '');
    const line = calls === 0 ? summary : short;
    calls += 1;
    return chatEnvelope({ relevant: true, line, clarifyingPrompt: '' });
  });
  const response = await demo.handle(
    post('/v1/drafts/acknowledgement', { answer: juniperAnswers.loves, nodeId: 'loves' }),
  );
  assert.equal(response.status, 200);
  assert.equal(calls, 2);
  assert.deepEqual(await response.json(), { relevant: true, line: short, clarifyingPrompt: '' });
  assert.equal(prompts[1]?.includes('line_rejected_words'), true);
  assert.equal(prompts[1]?.includes(juniperAnswers.loves.slice(0, 40)), false);
  assert.equal(prompts[0]?.includes('about 12 to 25 words'), true);
});
