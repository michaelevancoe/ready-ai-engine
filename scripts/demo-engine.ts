import { assertAdapterAllowed } from '../src/adapter.ts';
import type { WorkerBindings } from '../src/bindings.ts';
import { handleRequest, type AppDeps } from '../src/app.ts';
import {
  fallbackSocialStory,
  finishSundayNote,
  parseSocialStory,
  parseSocialStoryRequest,
  parseSundayUpdate,
  parseSundayUpdateRequest,
  socialStoryMessages,
  socialStorySchema,
  socialStorySchemaName,
  sundayUpdateMessages,
  sundayUpdateSchema,
  sundayUpdateSchemaName,
  type StoryChurch,
} from '../src/demo-drafts.ts';
import { ConfigError, GenerateError, SchemaRejected } from '../src/errors.ts';
import { generate } from '../src/generate.ts';
import { json } from '../src/http.ts';
import { parseIntake, type IntakeAnswers } from '../src/intake.ts';
import { emitSafe } from '../src/log.ts';
import { emptyMemoryAccessWorld, memoryAccessSource } from '../src/memory-access.ts';
import { churchStore, ids, type MemoryStore } from '../src/memory-store.ts';
import { childProfileSchemaName, type ChildProfile } from '../src/profile.ts';
import { isRecord, type JsonSchema } from '../src/schema.ts';
import { fictionalDemoEnv } from '../src/demo-env.ts';
import { sessionAuthVerifier, sessionToken } from '../src/session-auth.ts';
import { ACK_FALLBACK } from '../web/lib/acknowledgement.ts';
import { intakeTree, isSectionId, type SectionId } from '../web/lib/intake-tree.ts';
import { demoModelMode, localDemoEnabled } from '../web/lib/local-demo.ts';
import { liveDemoBindings, mergeDemoEnv, parseDevVars } from './live-env.ts';

export interface DemoOpenOptions {
  fromEnvironment?: boolean;
  model?: string;
  shell?: Readonly<Record<string, string | undefined>>;
  devVarsText?: string;
  readDevVarsFile?: boolean;
  fetchImpl?: typeof fetch;
  loadDevVars?: () => Record<string, string>;
}

const ANSWER_KEYS = [
  'preferredName',
  'ageYears',
  'sensoryNotes',
  'supportNeeds',
  'whatHelps',
  'whatToAvoid',
] as const;

const ACK_GATEWAY_GUARD = 19;

export class DemoContext {
  private readonly store: MemoryStore;
  private readonly deps: AppDeps;
  private readonly mock: boolean;
  private readonly gatewayCalls: number[] = [];

  private constructor(env: WorkerBindings, fetchImpl: typeof fetch, mock: boolean) {
    assertAdapterAllowed(env, 'memory');
    this.mock = mock;
    this.store = churchStore();
    const countedFetch: typeof globalThis.fetch = async (input, init) => {
      this.gatewayCalls.push(Date.now());
      return fetchImpl(input, init);
    };
    this.deps = {
      env,
      fetch: countedFetch,
      storeFactory: () => this.store,
      log: emitSafe,
      now: () => Date.now(),
      auth: sessionAuthVerifier(),
      accessSource: memoryAccessSource(emptyMemoryAccessWorld()),
    };
  }

  private gatewayBusy(): boolean {
    const now = Date.now();
    let keep = 0;
    for (const time of this.gatewayCalls) {
      if (now - time < 60_000) {
        this.gatewayCalls[keep] = time;
        keep += 1;
      }
    }
    this.gatewayCalls.length = keep;
    return keep >= ACK_GATEWAY_GUARD;
  }

  static fromBindings(
    env: Readonly<Record<string, string | undefined>>,
    fetchImpl: typeof fetch = globalThis.fetch,
  ): DemoContext {
    assertAdapterAllowed(env, 'memory');
    const mode = demoModelMode(env.READY_DEMO_MODEL);
    switch (mode) {
      case 'mock':
        return new DemoContext(fictionalDemoEnv, mockGateway, true);
      case 'live':
        return new DemoContext(liveDemoBindings(env), fetchImpl, false);
      default: {
        const unexpected: never = mode;
        return unexpected;
      }
    }
  }

  static async open(envValue: string | undefined, options?: DemoOpenOptions): Promise<DemoContext> {
    if (!localDemoEnabled(envValue)) throw new Error('READY_LOCAL_DEMO is off');
    const shell = options?.shell;
    assertAdapterAllowed(
      {
        READY_SIGN_IN: shell?.READY_SIGN_IN ?? process.env.READY_SIGN_IN,
        READY_MODE: shell?.READY_MODE ?? process.env.READY_MODE,
      },
      'memory',
    );
    if (options?.fromEnvironment !== true) return new DemoContext(fictionalDemoEnv, mockGateway, true);
    const merged = mergeDemoEnv(devVarsLayer(options), shell ?? process.env);
    const mode = demoModelMode(options.model !== undefined ? options.model : merged.READY_DEMO_MODEL);
    switch (mode) {
      case 'mock':
        return new DemoContext(fictionalDemoEnv, mockGateway, true);
      case 'live':
        return new DemoContext(liveDemoBindings(merged), options.fetchImpl ?? globalThis.fetch, false);
      default: {
        const unexpected: never = mode;
        return unexpected;
      }
    }
  }

  async handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/healthz') {
      return new Response('ok', {
        status: 200,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }
    if (request.method === 'POST' && url.pathname === '/v1/intake/profile') {
      const prepared = await prepareIntake(request);
      if (prepared instanceof Response) return prepared;
      return this.callEngine(url, prepared);
    }
    if (request.method === 'POST' && /^\/v1\/profiles\/([^/]+)\/approve$/.test(url.pathname)) {
      return this.callEngine(url, '{}');
    }
    if (request.method === 'POST' && url.pathname === '/v1/drafts/social-story') {
      return this.handleSocialStory(request);
    }
    if (request.method === 'POST' && url.pathname === '/v1/drafts/sunday-update') {
      return this.handleSundayUpdate(request);
    }
    if (request.method === 'POST' && url.pathname === '/v1/drafts/acknowledgement') {
      return this.handleAcknowledgement(request);
    }
    return json({ error: 'not_found' }, 404);
  }

  private async handleSocialStory(request: Request): Promise<Response> {
    const parsed = await parsedBody(request, parseSocialStoryRequest);
    if (parsed instanceof Response) return parsed;
    try {
      const draft = await generate({
        endpoint: 'intake.profile',
        messages: socialStoryMessages(parsed),
        schemaName: socialStorySchemaName,
        schema: socialStorySchema,
        parse: (value) => parseSocialStory(value, parsed),
        env: this.deps.env,
        fetch: this.deps.fetch,
        log: this.deps.log,
      });
      return json({ ...draft, source: 'model' }, 200);
    } catch (error) {
      if (error instanceof GenerateError) return json(fallbackSocialStory(parsed), 200);
      if (error instanceof ConfigError) return json({ error: 'misconfigured' }, 500);
      throw error;
    }
  }

  private async handleAcknowledgement(request: Request): Promise<Response> {
    const parsed = await parsedBody(request, parseAcknowledgementRequest);
    if (parsed instanceof Response) return parsed;
    if (this.mock) return json(mockAcknowledgement(parsed.answer, parsed.sectionId), 200);
    if (this.gatewayBusy()) {
      return json({ relevant: true, line: ACK_FALLBACK, clarifyingPrompt: '' }, 200);
    }
    try {
      const value = await generate({
        endpoint: 'intake.profile',
        messages: acknowledgementMessages(parsed),
        schemaName: intakeAcknowledgementSchemaName,
        schema: acknowledgementSchema,
        parse: (value) => parseAcknowledgement(value, parsed),
        env: this.deps.env,
        fetch: this.deps.fetch,
        log: this.deps.log,
        maxTokens: 80,
        attempts: 'once',
      });
      return json(value, 200);
    } catch (error) {
      if (error instanceof GenerateError) {
        return json({ relevant: true, line: ACK_FALLBACK, clarifyingPrompt: '' }, 200);
      }
      if (error instanceof ConfigError) return json({ error: 'misconfigured' }, 500);
      throw error;
    }
  }

  private async handleSundayUpdate(request: Request): Promise<Response> {
    const parsed = await parsedBody(request, parseSundayUpdateRequest);
    if (parsed instanceof Response) return parsed;
    return this.completeDraft(
      sundayUpdateMessages(parsed),
      sundayUpdateSchemaName,
      sundayUpdateSchema,
      (value) =>
        parseSundayUpdate(value, parsed.notes, parsed.childName, {
          leader: parsed.leader,
          church: parsed.church,
        }),
    );
  }

  private async completeDraft<T>(
    messages: readonly { role: 'system' | 'user'; content: string }[],
    schemaName: string,
    schema: JsonSchema,
    parse: (value: unknown) => T,
    maxTokens?: number,
  ): Promise<Response> {
    try {
      const value = await generate({
        endpoint: 'intake.profile',
        messages,
        schemaName,
        schema,
        parse,
        env: this.deps.env,
        fetch: this.deps.fetch,
        log: this.deps.log,
        ...(maxTokens === undefined ? {} : { maxTokens }),
      });
      return json(value, 200);
    } catch (error) {
      if (error instanceof GenerateError) return json({ error: 'generation_failed' }, 502);
      if (error instanceof ConfigError) return json({ error: 'misconfigured' }, 500);
      throw error;
    }
  }

  private async callEngine(url: URL, body: string): Promise<Response> {
    const token = sessionToken(ids.avery);
    return handleRequest(
      new Request(url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body,
      }),
      this.deps,
    );
  }
}

async function prepareIntake(request: Request): Promise<Response | string> {
  let value: unknown;
  try {
    value = (await request.json()) as unknown;
  } catch {
    return json({ error: 'invalid_input' }, 400);
  }
  if (!exactAnswers(value)) return json({ error: 'invalid_input' }, 400);
  const intake = parseIntake({
    organizationId: ids.org,
    childId: ids.rowan,
    answers: value,
  });
  if (intake === null) return json({ error: 'invalid_input' }, 400);
  return JSON.stringify(intake);
}

async function parsedBody<T>(request: Request, parse: (value: unknown) => T | null): Promise<Response | T> {
  let value: unknown;
  try {
    value = (await request.json()) as unknown;
  } catch {
    return json({ error: 'invalid_input' }, 400);
  }
  const parsed = parse(value);
  if (parsed === null) return json({ error: 'invalid_input' }, 400);
  return parsed;
}

function exactAnswers(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  return keys.length === ANSWER_KEYS.length && ANSWER_KEYS.every((key) => Object.hasOwn(value, key));
}

function devVarsLayer(options: DemoOpenOptions): Record<string, string> {
  if (options.devVarsText !== undefined) return parseDevVars(options.devVarsText);
  if (options.readDevVarsFile === false) return {};
  if (options.model !== undefined && options.readDevVarsFile !== true) return {};
  return options.loadDevVars?.() ?? {};
}

function chatEnvelope(content: unknown, status = 200): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { role: 'assistant', content: JSON.stringify(content) } }],
    }),
    { status, headers: { 'content-type': 'application/json' } },
  );
}

const mockGateway: typeof fetch = async (input, init) => {
  const request = input instanceof Request ? input : new Request(input, init);
  let payload: unknown;
  try {
    payload = JSON.parse(await request.text()) as unknown;
  } catch {
    return new Response(null, { status: 502 });
  }
  const name = schemaName(payload);
  if (name === null) return new Response(null, { status: 502 });
  if (name === childProfileSchemaName) {
    const answers = answersFromGateway(payload);
    if (answers === null) return new Response(null, { status: 502 });
    return chatEnvelope(profileFromAnswers(answers));
  }
  const content = userContent(payload);
  if (content === null) return new Response(null, { status: 502 });
  const draft = mockDraft(name, content);
  if (draft === null) return new Response(null, { status: 502 });
  return chatEnvelope(draft);
};

function schemaName(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  const format = payload.response_format;
  if (!isRecord(format)) return null;
  const spec = format.json_schema;
  if (!isRecord(spec) || typeof spec.name !== 'string' || spec.name.length === 0) return null;
  return spec.name;
}

function userContent(payload: unknown): string | null {
  if (!isRecord(payload) || !Array.isArray(payload.messages)) return null;
  let content: string | null = null;
  for (const message of payload.messages) {
    if (isRecord(message) && message.role === 'user' && typeof message.content === 'string') {
      content = message.content;
    }
  }
  return content;
}

function userJson(payload: unknown): unknown | null {
  const content = userContent(payload);
  if (content === null) return null;
  try {
    return JSON.parse(content) as unknown;
  } catch {
    return null;
  }
}

function mockDraft(name: string, content: string): unknown | null {
  switch (name) {
    case socialStorySchemaName: {
      const parsed = readSocial(content);
      if (parsed === null) return null;
      return mockSocialStory(parsed.childName, parsed.church);
    }
    case sundayUpdateSchemaName: {
      const parsed = readSunday(content);
      if (parsed === null) return null;
      return mockSundayUpdate(parsed.childName, parsed.leader, parsed.church);
    }
    case intakeAcknowledgementSchemaName: {
      const read = readAcknowledgementContent(content);
      if (read === null) return null;
      return mockAcknowledgement(read.answer, read.sectionId);
    }
    default:
      return null;
  }
}

function readChild(content: string): { childName: string; rest: string } | null {
  const breakAt = content.indexOf('\n');
  if (breakAt < 0) return null;
  const line = content.slice(0, breakAt);
  const prefix = 'Child: ';
  if (!line.startsWith(prefix)) return null;
  const childName = line.slice(prefix.length);
  if (childName.length < 1 || childName.length > 80) return null;
  return { childName, rest: content.slice(breakAt + 1) };
}

function readLabeled(text: string): { text: string }[] | null {
  if (text.length === 0) return [];
  const lines: { text: string }[] = [];
  for (const row of text.split('\n')) {
    const at = row.indexOf(': ');
    if (at < 1) {
      const last = lines[lines.length - 1];
      if (last === undefined) return null;
      last.text = `${last.text}\n${row}`;
      continue;
    }
    lines.push({ text: row.slice(at + 2) });
  }
  return lines;
}

const SOCIAL_CHURCH_LABELS = ['Church', 'Service', 'Room', 'Leader', 'Plan'] as const;

function readSocial(content: string): { childName: string; church: StoryChurch; lines: { text: string }[] } | null {
  const head = readChild(content);
  if (head === null) return null;
  const rows = head.rest.split('\n');
  const values: string[] = [];
  let index = 0;
  for (let labelIndex = 0; labelIndex < SOCIAL_CHURCH_LABELS.length; labelIndex += 1) {
    const label = SOCIAL_CHURCH_LABELS[labelIndex];
    const row = rows[index];
    const prefix = `${label}: `;
    if (label === undefined || row === undefined || !row.startsWith(prefix)) return null;
    let value = row.slice(prefix.length);
    index += 1;
    const nextLabel = SOCIAL_CHURCH_LABELS[labelIndex + 1];
    while (index < rows.length) {
      const next = rows[index];
      if (next === undefined) break;
      if (nextLabel !== undefined) {
        if (next.startsWith(`${nextLabel}: `)) break;
      } else if (isLabeledRow(next)) {
        break;
      }
      value += `\n${next}`;
      index += 1;
    }
    values.push(value);
  }
  const name = values[0];
  const service = values[1];
  const room = values[2];
  const leader = values[3];
  const plan = values[4];
  if (name === undefined || service === undefined || room === undefined || leader === undefined || plan === undefined) {
    return null;
  }
  const lines = readLabeled(rows.slice(index).join('\n'));
  if (lines === null) return null;
  return { childName: head.childName, church: { name, service, room, leader, plan }, lines };
}

function isLabeledRow(row: string): boolean {
  return row.indexOf(': ') > 0;
}

function readSunday(content: string): { childName: string; leader: string; church: string; notes: string } | null {
  const head = readChild(content);
  const leaderMark = 'Leader: ';
  const churchMark = '\nChurch: ';
  const notesMark = '\nVolunteer notes:\n';
  if (head === null || !head.rest.startsWith(leaderMark)) return null;
  const churchAt = head.rest.indexOf(churchMark);
  if (churchAt < leaderMark.length) return null;
  const leader = head.rest.slice(leaderMark.length, churchAt);
  const afterChurch = head.rest.slice(churchAt + churchMark.length);
  const notesAt = afterChurch.indexOf(notesMark);
  if (notesAt < 0) return null;
  return {
    childName: head.childName,
    leader,
    church: afterChurch.slice(0, notesAt),
    notes: afterChurch.slice(notesAt + notesMark.length),
  };
}

const intakeAcknowledgementSchemaName = 'intake_acknowledgement';

const acknowledgementSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['relevant', 'line', 'clarifyingPrompt'],
  properties: {
    relevant: { type: 'boolean' },
    line: { type: 'string', minLength: 1, maxLength: 120 },
    clarifyingPrompt: { type: 'string', minLength: 0, maxLength: 120 },
  },
} satisfies JsonSchema;

interface AckRequest {
  readonly answer: string;
  readonly nodeId: string;
  readonly sectionId: SectionId;
  readonly question: string;
}

function parseAcknowledgementRequest(value: unknown): AckRequest | null {
  if (!isRecord(value)) return null;
  const keys = Object.keys(value);
  if (keys.length !== 2 || !Object.hasOwn(value, 'answer') || !Object.hasOwn(value, 'nodeId')) return null;
  if (typeof value.answer !== 'string' || typeof value.nodeId !== 'string') return null;
  const answer = value.answer.trim();
  if (answer.length < 1 || answer.length > 500) return null;
  const node = intakeTree.nodes.find((item) => item.id === value.nodeId);
  if (node === undefined || !isSectionId(node.sectionId)) return null;
  return { answer, nodeId: node.id, sectionId: node.sectionId, question: node.prompt };
}

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

const ACK_BLOCKED = ['autism', 'aphasia', 'diagnos', 'disorder', 'disabilit', 'impair', 'individuals'];

const CHILD_PRONOUN = /\b(?:he|she|him|his|her|hers|they|them|their|theirs)\b/iu;

const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'to',
  'of',
  'is',
  'are',
  'was',
  'be',
  'it',
  'in',
  'on',
  'for',
  'with',
  'when',
  'what',
  'how',
  'that',
  'this',
  'i',
  'you',
  'he',
  'she',
  'they',
  'his',
  'her',
  'not',
  'no',
  'usually',
  'very',
  'like',
  'likes',
]);

const CARE = new Set([
  'quiet',
  'hello',
  'train',
  'trains',
  'crowded',
  'doorway',
  'doorways',
  'corner',
  'heads',
  'song',
  'picture',
  'cards',
  'card',
  'adult',
  'allergy',
  'allergies',
  'food',
  'bathroom',
  'headphone',
  'headphones',
  'calm',
  'loud',
  'warning',
  'seat',
  'rock',
  'rocks',
  'painted',
  'lego',
  'dinosaur',
  'peanut',
  'disney',
  'break',
  'point',
  'words',
  'sign',
  'reminder',
  'transition',
  'light',
  'lights',
  'snack',
  'church',
  'room',
  'volunteer',
  'help',
  'helps',
  'hurt',
  'run',
  'upset',
  'tell',
  'tells',
  'need',
  'needs',
  'know',
  'settle',
  'space',
  'object',
  'grown',
  'change',
  'changes',
  'music',
  'soft',
  'softer',
]);

const NONSENSE = new Set([
  'banana',
  'purple',
  'zebra',
  'moonlight',
  'moon',
  'cheese',
  'muffin',
  'muffins',
  'qwerty',
  'asdf',
]);

function cannedPrompt(sectionId: SectionId, name = 'Rowan'): string {
  const asked = named(sectionId, name);
  if (asked.length <= 120 && !CHILD_PRONOUN.test(asked)) return asked;
  const shorter = `I want to make sure I understand. Could you say a little more about ${name}?`;
  if (shorter.length <= 120 && !CHILD_PRONOUN.test(shorter)) return shorter;
  return 'I want to make sure I understand. Could you say a little more?';
}

function named(sectionId: SectionId, name: string): string {
  switch (sectionId) {
    case 'helps':
      return `I want to make sure I understand. What usually helps ${name} settle when things feel like too much?`;
    case 'about':
      return `I want to make sure I understand. How would you describe ${name} in a sentence or two?`;
    case 'loves':
      return `I want to make sure I understand. What does ${name} love, at church or at home?`;
    case 'overwhelms':
      return `I want to make sure I understand. What tends to overwhelm ${name} at church or in a new place?`;
    case 'communication':
      return `I want to make sure I understand. How does ${name} usually let you know what is needed?`;
    case 'sensory':
      return `I want to make sure I understand. What sensory things should a volunteer know about ${name}?`;
    case 'toileting':
      return `I want to make sure I understand. How does ${name} usually say the bathroom is needed?`;
    case 'allergies':
      return `I want to make sure I understand. Are there any allergies a volunteer should know about ${name}?`;
    case 'behavior':
      return `I want to make sure I understand. When ${name} is very upset, what helps in that moment?`;
    default: {
      const leftover: never = sectionId;
      return leftover;
    }
  }
}

const UNCERTAIN_OR_NO = new Set([
  'not sure',
  'unsure',
  'i dont know',
  'idk',
  'dont know yet',
  'none',
  'no',
  'nope',
  'not really',
  'no not really',
  'nothing',
  'nothing special',
  'n a',
  'not that i know of',
]);

function uncertainOrNo(answer: string): boolean {
  const normalized = answer
    .toLowerCase()
    .replace(/['\u2018\u2019]/gu, '')
    .replace(/[^a-z0-9]+/gu, ' ')
    .trim();
  return UNCERTAIN_OR_NO.has(normalized);
}

function judgeRelevance(answer: string): boolean {
  if (uncertainOrNo(answer)) return true;
  const tokens = answer.toLowerCase().match(/[a-z0-9]+/gu) ?? [];
  if (tokens.some((token) => token === 'tick' || token.startsWith('tick'))) return true;
  const content = tokens.filter((token) => !STOPWORDS.has(token));
  if (content.some((token) => CARE.has(token))) return true;
  if (content.length === 0) return true;
  if (content.some((token) => /^\d+$/u.test(token))) return false;
  if (content.some((token) => token.length >= 4 && !/[aeiou]/u.test(token))) return false;
  let nonsense = 0;
  for (const token of content) {
    if (NONSENSE.has(token)) nonsense += 1;
  }
  return nonsense < 2;
}

function careSignal(answer: string): boolean {
  const tokens = answer.toLowerCase().match(/[a-z0-9]+/gu) ?? [];
  if (tokens.some((token) => token === 'tick' || token.startsWith('tick'))) return true;
  return tokens.some((token) => CARE.has(token));
}

function mockAcknowledgement(answer: string, sectionId: SectionId): {
  relevant: boolean;
  line: string;
  clarifyingPrompt: string;
} {
  const content = (answer.toLowerCase().match(/[a-z0-9]+/gu) ?? []).filter((token) => !STOPWORDS.has(token));
  const sorted = [...content].sort();
  const helpsPhrase =
    sectionId === 'helps' &&
    sorted.length === 3 &&
    sorted[0] === 'pizza' &&
    sorted[1] === 'rocket' &&
    sorted[2] === 'sandwich';
  const relevant = helpsPhrase ? false : judgeRelevance(answer);
  return {
    relevant,
    line: 'Thanks. That helps.',
    clarifyingPrompt: relevant ? '' : cannedPrompt(sectionId),
  };
}

function acknowledgementMessages(request: AckRequest): { role: 'system' | 'user'; content: string }[] {
  return [
    { role: 'system', content: ACKNOWLEDGEMENT_PROMPT },
    {
      role: 'user',
      content: `Answer: ${request.answer}\nSection: ${request.sectionId}\nQuestion: ${request.question}`,
    },
  ];
}

function readAcknowledgementContent(content: string): { answer: string; sectionId: SectionId } | null {
  const marker = 'Answer: ';
  const section = '\nSection: ';
  const question = '\nQuestion: ';
  if (!content.startsWith(marker)) return null;
  const at = content.indexOf(section);
  if (at < marker.length) return null;
  const answer = content.slice(marker.length, at).trim();
  if (answer.length === 0) return null;
  const rest = content.slice(at + section.length);
  const questionAt = rest.indexOf(question);
  const sectionId = (questionAt < 0 ? rest : rest.slice(0, questionAt)).trim();
  if (!isSectionId(sectionId)) return null;
  return { answer, sectionId };
}

function parseAcknowledgement(
  value: unknown,
  request: AckRequest,
): { relevant: boolean; line: string; clarifyingPrompt: string } {
  if (
    !isRecord(value) ||
    typeof value.line !== 'string' ||
    typeof value.relevant !== 'boolean' ||
    typeof value.clarifyingPrompt !== 'string'
  ) {
    throw new SchemaRejected();
  }
  const line = oneLine(value.line);
  if (line.length < 1) throw new SchemaRejected();
  const relevant = value.relevant || careSignal(request.answer) || uncertainOrNo(request.answer);
  const prompt = oneLine(value.clarifyingPrompt);
  return {
    relevant,
    line: lineAccepted(line, request.answer) ? line : ACK_FALLBACK,
    clarifyingPrompt: relevant ? '' : promptAccepted(prompt, request.answer) ? prompt : cannedPrompt(request.sectionId),
  };
}

function oneLine(value: string): string {
  return value.replace(/[\r\n]+/gu, ' ').replace(/ {2,}/gu, ' ').trim();
}

function lineAccepted(line: string, answer: string): boolean {
  if (!surfaceAccepted(line, answer)) return false;
  if (!line.endsWith('.') && !line.endsWith('!')) return false;
  return !line.includes('?');
}

function promptAccepted(prompt: string, answer: string): boolean {
  if (!surfaceAccepted(prompt, answer)) return false;
  return !/\b(?:special|needs)\b/u.test(prompt.toLowerCase());
}

function surfaceAccepted(text: string, answer: string): boolean {
  if (text.length < 1 || text.length > 120) return false;
  if (/[^\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]/u.test(text)) return false;
  const lower = text.toLowerCase();
  if (ACK_BLOCKED.some((word) => lower.includes(word))) return false;
  if (CHILD_PRONOUN.test(text)) return false;
  return !restatesAnswer(text, answer);
}

function restatesAnswer(line: string, answer: string): boolean {
  const lineText = plain(line);
  const answerText = plain(answer);
  if (lineText.length === 0 || answerText.length === 0) return false;
  if (lineText === answerText) return true;
  if (answerText.length >= 12 && lineText.includes(answerText)) return true;
  return lineText.length >= 12 && answerText.includes(lineText);
}

function plain(value: string): string {
  return value.toLowerCase().replace(/[.!?]+$/u, '').replace(/\s+/gu, ' ').trim();
}

function mockSocialStory(childName: string, church: StoryChurch): { title: string; body: string } {
  const body = `${childName} arrives at ${church.name}. ${childName} goes to ${church.room}. ${church.leader} says hello.`.slice(
    0,
    2000,
  );
  return { title: `Sunday with ${childName}`.slice(0, 120), body };
}

function mockSundayUpdate(childName: string, leader: string, church: string): { body: string } {
  return { body: finishSundayNote(`Sunday went well for ${childName}.`, leader, church) };
}

function answersFromGateway(payload: unknown): IntakeAnswers | null {
  const parsed = userJson(payload);
  if (!isRecord(parsed)) return null;
  if (typeof parsed.preferredName !== 'string' || typeof parsed.ageYears !== 'number') return null;
  if (typeof parsed.sensoryNotes !== 'string' || typeof parsed.supportNeeds !== 'string') return null;
  if (typeof parsed.whatHelps !== 'string' || typeof parsed.whatToAvoid !== 'string') return null;
  return {
    preferredName: parsed.preferredName,
    ageYears: parsed.ageYears,
    sensoryNotes: parsed.sensoryNotes,
    supportNeeds: parsed.supportNeeds,
    whatHelps: parsed.whatHelps,
    whatToAvoid: parsed.whatToAvoid,
  };
}

function profileFromAnswers(answers: IntakeAnswers): ChildProfile {
  const lead = 'Explain the next activity first.';
  return {
    summary: `${answers.preferredName}, age ${answers.ageYears}. A parent still needs to approve this draft.`.slice(
      0,
      2000,
    ),
    sensoryConsiderations: noted(answers.sensoryNotes),
    supportStrategies: supportLines(answers),
    avoid: noted(answers.whatToAvoid),
    volunteerGuidance:
      answers.whatHelps.length === 0 ? lead : `${lead} ${answers.whatHelps}`.slice(0, 2000),
  };
}

function supportLines(answers: IntakeAnswers): string[] {
  if (answers.whatHelps.length > 0) return noted(answers.whatHelps);
  if (answers.supportNeeds.length > 0) return noted(answers.supportNeeds);
  return ['None noted.'];
}

function noted(value: string): string[] {
  if (value.length === 0) return ['None noted.'];
  return [value.slice(0, 400)];
}
