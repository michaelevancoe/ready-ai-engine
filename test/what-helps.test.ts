import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DemoContext } from '../scripts/demo-engine.ts';
import { SchemaRejected } from '../src/errors.ts';
import { intakeMessages, type IntakeAnswers } from '../src/intake.ts';
import { parseChildProfile, type ChildProfile } from '../src/profile.ts';
import { filterWhatHelps } from '../src/what-helps.ts';
import { submitIntake, type IntakeAnswers as PostedAnswers } from '../web/lib/desk.ts';
import { seedDemoVisits } from '../web/lib/demo-visits.ts';
import { whatHelpsNote } from '../web/lib/what-helps.ts';
import { chatEnvelope, sampleProfile, testEnv } from './fixtures.ts';
import { juniperAge, juniperAnswers, juniperName } from './fixtures/long-intake.ts';

const BANNED = [
  'autism',
  'aphasia',
  'diagnosed',
  'disorder',
  'disability',
  'impaired',
  'individuals',
  'medical',
  'allergy',
  'medication',
  'condition',
  'special needs',
] as const;

test('filterWhatHelps keeps plain short bullets and drops the rest', () => {
  const input = [
    'Give Juniper a 5-minute warning.',
    'Let Juniper hold Pip the fox.',
    'Offer Juniper a weighted lap pad.',
    'Show Juniper the picture schedule.',
    'Give Juniper a 5-minute warning.',
    'Juniper has a gluten allergy and a medical condition.',
    'Juniper говорит with her brother.',
    'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen',
    `${'word '.repeat(30)}end`,
  ];
  const kept = filterWhatHelps(input);
  assert.deepEqual(kept, [
    'Give Juniper a 5-minute warning.',
    'Let Juniper hold Pip the fox.',
    'Offer Juniper a weighted lap pad.',
    'Show Juniper the picture schedule.',
  ]);
  assert.deepEqual(input.length, 9);
  assert.deepEqual(filterWhatHelps([]), []);
  assert.deepEqual(filterWhatHelps(['   ', 'Stay nearby.']), ['Stay nearby.']);
  for (const word of BANNED) {
    assert.deepEqual(filterWhatHelps([`Please note ${word} today.`, 'Stay nearby.', 'Give a warning.']), [
      'Stay nearby.',
      'Give a warning.',
    ]);
  }
  const sixteen = Array.from({ length: 16 }, (_, index) => `w${index}`).join(' ');
  const seventeen = `${sixteen} extra`;
  assert.deepEqual(filterWhatHelps([sixteen, seventeen]), [sixteen]);
  const exact = 'a'.repeat(110);
  assert.deepEqual(filterWhatHelps([exact, `${exact}b`]), [exact]);
  assert.deepEqual(filterWhatHelps(['Stay close.', 'stay close.']), ['Stay close.']);
});

test('a child profile requires three to five whatHelps bullets', () => {
  const base = sampleProfile();
  assert.equal(parseChildProfile(base).whatHelps.length >= 3, true);
  assert.throws(() => parseChildProfile({ ...base, whatHelps: base.whatHelps.slice(0, 2) }), SchemaRejected);
  assert.throws(
    () => parseChildProfile({ ...base, whatHelps: [...base.whatHelps, 'Fourth.', 'Fifth.', 'Sixth.'] }),
    SchemaRejected,
  );
  assert.throws(() => parseChildProfile({ ...base, whatHelps: undefined }), SchemaRejected);
  assert.throws(() => parseChildProfile({ ...base, whatHelps: ['a'.repeat(111), 'Stay nearby.', 'Give a warning.'] }), SchemaRejected);
});

test('intake asks for a short whatHelps summary and sends the full answer', () => {
  const answers = juniperIntake();
  const messages = intakeMessages(answers);
  const system = messages.find((message) => message.role === 'system')?.content ?? '';
  assert.equal(system.includes('Condense'), true);
  assert.equal(system.includes('does not copy') || system.includes('not a copy'), true);
  assert.equal(system.includes('only what the parent said'), true);
  assert.equal(system.includes('Name the child'), true);
  assert.equal(/diagnosis|condition|label|medical|allerg/i.test(system), true);
  assert.equal(system.includes('plain words'), true);
  assert.equal(system.includes('3 to 5'), true);
  assert.equal(system.includes('long'), true);
  const user = messages.find((message) => message.role === 'user')?.content ?? '';
  const sent = JSON.parse(user) as { sensoryNotes: string; whatHelps: string; whatToAvoid: string };
  assert.equal(sent.sensoryNotes, juniperAnswers.loves);
  assert.equal(sent.whatHelps, juniperAnswers.whatHelps);
  assert.equal(sent.whatToAvoid, juniperAnswers.overwhelms);
  assert.equal(juniperAnswers.loves.length > 1500, true);
  assert.equal(user.includes(juniperAnswers.allergies), false);
});

test('a long Juniper intake keeps a short summary and the full answers', async () => {
  const answers = juniperIntake();
  const calls: string[] = [];
  const demo = await DemoContext.open('1', {
    fromEnvironment: true,
    model: 'live',
    readDevVarsFile: false,
    shell: {
      READY_DEMO_MODEL: 'live',
      AI_GATEWAY_BASE_URL: testEnv.AI_GATEWAY_BASE_URL,
      AI_GATEWAY_ACCOUNT_ID: testEnv.AI_GATEWAY_ACCOUNT_ID,
      AI_GATEWAY_ID: testEnv.AI_GATEWAY_ID,
      AI_GATEWAY_TOKEN: testEnv.AI_GATEWAY_TOKEN,
      INTAKE_PROFILE_PROVIDER: 'workers-ai',
      INTAKE_PROFILE_MODEL: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      INTAKE_PROFILE_FALLBACK_PROVIDER: 'workers-ai',
      INTAKE_PROFILE_FALLBACK_MODEL: '@cf/meta/llama-3.1-8b-instruct',
    },
    fetchImpl: async (input, init) => {
      const request = new Request(input, init);
      calls.push(await request.text());
      return chatEnvelope(juniperModelProfile());
    },
  });
  const response = await demo.handle(
    new Request('http://example.com/v1/intake/profile', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(answers),
    }),
  );
  assert.equal(response.status, 201);
  assert.equal(calls.length, 1);
  const payload = JSON.parse(calls[0] ?? '{}') as {
    max_tokens?: number;
    messages?: { role?: string; content?: string }[];
  };
  assert.equal(payload.max_tokens, 256);
  const user = payload.messages?.find((message) => message.role === 'user')?.content ?? '';
  const sent = JSON.parse(user) as { sensoryNotes: string; whatHelps: string };
  assert.equal(sent.sensoryNotes, juniperAnswers.loves);
  assert.equal(sent.whatHelps, juniperAnswers.whatHelps);
  assert.equal(user.includes(juniperAnswers.allergies), false);
  const body = (await response.json()) as { profile: { whatHelps: string[]; sensoryConsiderations: string[] } };
  assert.equal(body.profile.whatHelps.length >= 3 && body.profile.whatHelps.length <= 5, true);
  for (const bullet of body.profile.whatHelps) {
    assert.equal(bullet.split(/\s+/).length <= 16, true);
    assert.equal(/allerg|medical|gluten|diagnos/i.test(bullet), false);
  }
  assert.equal(body.profile.whatHelps.some((bullet) => bullet.includes('Pip')), true);
  assert.equal(body.profile.sensoryConsiderations[0], 'Hand dryers are loud for Juniper.');
});

test('the shown profile stores a filtered summary and keeps every section line', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ id: '10000000-0000-4000-8000-000000000031', status: 'draft', profile: juniperModelProfile() }), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    });
  try {
    const result = await submitIntake(postedJuniper());
    assert.equal(result.type, 'draft');
    if (result.type !== 'draft') return;
    assert.equal(result.profile.whatHelps.length >= 3 && result.profile.whatHelps.length <= 5, true);
    assert.equal(result.profile.whatHelps.some((bullet) => /allerg|medical|gluten/i.test(bullet)), false);
    assert.equal(result.profile.whatHelps.some((bullet) => bullet.includes('Pip')), true);
    const sensory = result.profile.sections.find((section) => section.heading === 'Sensory considerations');
    assert.equal(sensory?.lines[0], 'Hand dryers are loud for Juniper.');
  } finally {
    globalThis.fetch = original;
  }
});

test('fewer than three surviving bullets stores an empty summary', async () => {
  const original = globalThis.fetch;
  const profile = juniperModelProfile();
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        id: '10000000-0000-4000-8000-000000000031',
        status: 'draft',
        profile: { ...profile, whatHelps: ['autism support', 'a medical plan', 'special needs help'] },
      }),
      { status: 201, headers: { 'content-type': 'application/json' } },
    );
  try {
    const result = await submitIntake(postedJuniper());
    assert.equal(result.type, 'draft');
    if (result.type !== 'draft') return;
    assert.deepEqual(result.profile.whatHelps, []);
    assert.equal(result.profile.sections.length, 5);
  } finally {
    globalThis.fetch = original;
  }
});

test('a profile 502 is tried once more, and a bad request is not', async () => {
  const original = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async (_url, init) => {
    calls.push(String(init?.body));
    if (calls.length === 1) {
      return new Response(JSON.stringify({ error: 'generation_failed' }), {
        status: 502,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(
      JSON.stringify({
        id: '10000000-0000-4000-8000-000000000031',
        status: 'draft',
        profile: juniperModelProfile(),
      }),
      { status: 201, headers: { 'content-type': 'application/json' } },
    );
  };
  try {
    const recovered = await submitIntake(postedJuniper());
    assert.equal(recovered.type, 'draft');
    assert.equal(calls.length, 2);
  } finally {
    globalThis.fetch = original;
  }

  const stuck: string[] = [];
  globalThis.fetch = async () => {
    stuck.push('502');
    return new Response(JSON.stringify({ error: 'generation_failed' }), {
      status: 502,
      headers: { 'content-type': 'application/json' },
    });
  };
  try {
    const failed = await submitIntake(postedJuniper());
    assert.equal(failed.type, 'fail');
    assert.equal(stuck.length, 2);
  } finally {
    globalThis.fetch = original;
  }

  const rejected: string[] = [];
  globalThis.fetch = async () => {
    rejected.push('400');
    return new Response(JSON.stringify({ error: 'invalid_input' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  };
  try {
    const once = await submitIntake(postedJuniper());
    assert.equal(once.type, 'fail');
    assert.equal(rejected.length, 1);
  } finally {
    globalThis.fetch = original;
  }
});

test('sample children carry a canned summary and Owen has none', () => {
  const records = seedDemoVisits();
  const ezra = records.find((record) => record.id === 'ezra');
  assert.ok(ezra);
  assert.equal(ezra.visit.intake.status, 'approved');
  if (ezra.visit.intake.status !== 'approved') return;
  const bullets = ezra.visit.intake.profile.whatHelps;
  assert.equal(bullets.length >= 3 && bullets.length <= 5, true);
  assert.equal(bullets.some((bullet) => /2-minute warning/.test(bullet)), true);
  assert.equal(bullets.some((bullet) => /full sentences/.test(bullet)), true);
  assert.equal(bullets.some((bullet) => /walks away/.test(bullet)), true);
  for (const bullet of bullets) {
    assert.equal(bullet.split(/\s+/).length <= 16, true);
    assert.equal(/allerg|medical|dairy/i.test(bullet), false);
  }
  assert.equal(ezra.visit.brief.phase, 'approved');
  if (ezra.visit.brief.phase !== 'approved') return;
  assert.equal(ezra.visit.brief.lines.some((line) => /dairy/i.test(line.text)), true);
  const owen = records.find((record) => record.id === 'owen');
  assert.ok(owen);
  assert.equal(owen.visit.intake.status, 'idle');
  for (const id of ['nora', 'hazel', 'lucy'] as const) {
    const record = records.find((item) => item.id === id);
    assert.ok(record);
    assert.equal(record.visit.intake.status, 'approved');
    if (record.visit.intake.status !== 'approved') continue;
    const helps = record.visit.intake.profile.whatHelps;
    assert.equal(helps.length >= 3 && helps.length <= 5, true);
    for (const bullet of helps) assert.equal(bullet.split(/\s+/).length <= 16, true);
  }
});

test('what helps footnotes match the reader', () => {
  assert.equal(
    whatHelpsNote('review'),
    'Ready wrote this from your answers. Check it before you approve: volunteers see it at the top of the brief.',
  );
  assert.equal(whatHelpsNote('sample'), 'Sample summary (pre-written)');
  assert.equal(
    whatHelpsNote('team'),
    "Written by Ready from the parent's approved answers. The parent's own words are below.",
  );
});

function juniperIntake(): IntakeAnswers {
  return {
    preferredName: juniperName,
    ageYears: juniperAge,
    sensoryNotes: juniperAnswers.loves,
    supportNeeds: juniperAnswers.communication,
    whatHelps: juniperAnswers.whatHelps,
    whatToAvoid: juniperAnswers.overwhelms,
  };
}

function postedJuniper(): PostedAnswers {
  return juniperIntake();
}

function juniperModelProfile(): ChildProfile {
  return {
    summary: 'Juniper, age 6. A parent still needs to approve this draft.',
    sensoryConsiderations: ['Hand dryers are loud for Juniper.'],
    supportStrategies: ['Show the picture schedule.'],
    avoid: ['Hand dryers.'],
    volunteerGuidance: 'Give a 5-minute warning.',
    whatHelps: [
      'Let Juniper hold Pip the fox.',
      'Offer Juniper a weighted lap pad.',
      'Show Juniper the picture schedule.',
      'Juniper needs a gluten free medical plan for her allergy.',
      'Let Juniper hold Pip the fox.',
    ],
  };
}
