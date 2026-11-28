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
  storyTokenAllowed,
  type SocialStoryRequest,
  sundayUpdateMessages,
  sundayUpdateSchema,
  sundayUpdateSchemaName,
  templateSundayNote,
  type StoryChurch,
} from '../src/demo-drafts.ts';
import { ConfigError, GenerateError, SchemaRejected, type FallbackReason } from '../src/errors.ts';
import { generate } from '../src/generate.ts';
import { json } from '../src/http.ts';
import { parseIntake, type IntakeAnswers } from '../src/intake.ts';
import { emitSafe } from '../src/log.ts';
import { emptyMemoryAccessWorld, memoryAccessSource } from '../src/memory-access.ts';
import { churchStore, ids, type MemoryStore } from '../src/memory-store.ts';
import { childProfileSchemaName, type ChildProfile } from '../src/profile.ts';
import { isRecord, type JsonSchema } from '../src/schema.ts';
import type { StoryPages } from '../src/sunday-story-text.ts';
import { filterWhatHelps } from '../src/what-helps.ts';
import { fictionalDemoEnv } from '../src/demo-env.ts';
import { sessionAuthVerifier, sessionToken } from '../src/session-auth.ts';
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

const STORY_MAX_TOKENS = 2048;

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
    let rejection: FallbackReason | undefined;
    try {
      return json(await this.writeSocialStory(parsed), 200);
    } catch (error) {
      if (error instanceof ConfigError) return json({ error: 'misconfigured' }, 500);
      if (!(error instanceof GenerateError)) throw error;
      rejection = error.fallbackReason;
    }
    try {
      return json(await this.writeSocialStory(parsed, rejection), 200);
    } catch (error) {
      if (error instanceof GenerateError) {
        return json(
          {
            ...fallbackSocialStory(parsed),
            fallbackReason: error.fallbackReason,
            model: this.deps.env.INTAKE_PROFILE_MODEL,
          },
          200,
        );
      }
      if (error instanceof ConfigError) return json({ error: 'misconfigured' }, 500);
      throw error;
    }
  }

  private writeSocialStory(
    parsed: SocialStoryRequest,
    rejection?: FallbackReason,
  ): Promise<{
    title: string;
    pages: StoryPages;
    source: 'model';
    model: string;
  }> {
    return generate({
      endpoint: 'intake.profile',
      messages: socialStoryMessages(parsed, rejection),
      schemaName: socialStorySchemaName,
      schema: socialStorySchema,
      parse: (value) => parseSocialStory(value, parsed),
      env: this.deps.env,
      fetch: this.deps.fetch,
      log: this.deps.log,
      maxTokens: STORY_MAX_TOKENS,
      attempts: 'once',
    }).then((draft) => ({ ...draft, source: 'model' as const, model: this.deps.env.INTAKE_PROFILE_MODEL }));
  }

  private async handleAcknowledgement(request: Request): Promise<Response> {
    const parsed = await parsedBody(request, parseAcknowledgementRequest);
    if (parsed instanceof Response) return parsed;
    if (parsed.sectionId === 'allergies') return json(allergyAcknowledgement(), 200);
    if (this.mock) return json(mockAcknowledgement(parsed.answer, parsed.sectionId), 200);
    if (this.gatewayBusy()) return json(fallbackAck(parsed, 'upstream_error'), 200);
    const write = (
      rejection?: FallbackReason,
    ): Promise<{
      relevant: boolean;
      line: string;
      clarifyingPrompt: string;
      fallbackReason?: FallbackReason;
    }> => {
      let repeated = false;
      return generate({
        endpoint: 'intake.profile',
        messages: acknowledgementMessages(parsed, rejection),
        schemaName: intakeAcknowledgementSchemaName,
        schema: acknowledgementSchema,
        parse: (value) => {
          try {
            return parseAcknowledgement(value, parsed);
          } catch (error) {
            if (error instanceof RecentRepeat) repeated = true;
            throw error;
          }
        },
        env: this.deps.env,
        fetch: this.deps.fetch,
        log: this.deps.log,
        maxTokens: 80,
        attempts: 'once',
      }).then(
        (value) => {
          if (value.fallbackReason !== undefined) this.logFallback(value.fallbackReason);
          return value;
        },
        (error: unknown) => {
          if (repeated) throw new RecentRepeat();
          throw error;
        },
      );
    };
    try {
      return json(await write(), 200);
    } catch (error) {
      if (error instanceof RecentRepeat) {
        try {
          return json(await write(), 200);
        } catch (again) {
          if (again instanceof GenerateError) return json(fallbackAck(parsed, reportedAckReason(again.fallbackReason)), 200);
          if (again instanceof RecentRepeat) return json(fallbackAck(parsed, 'line_rejected_repeat'), 200);
          if (again instanceof ConfigError) return json({ error: 'misconfigured' }, 500);
          throw again;
        }
      }
      if (error instanceof GenerateError && ackCanRetry(error.fallbackReason) && !this.gatewayBusy()) {
        try {
          return json(await write(error.fallbackReason), 200);
        } catch (again) {
          if (again instanceof GenerateError) return json(fallbackAck(parsed, reportedAckReason(again.fallbackReason)), 200);
          if (again instanceof RecentRepeat) return json(fallbackAck(parsed, 'line_rejected_repeat'), 200);
          if (again instanceof ConfigError) return json({ error: 'misconfigured' }, 500);
          throw again;
        }
      }
      if (error instanceof GenerateError && error.reason === 'gateway' && !this.gatewayBusy()) {
        try {
          return json(await write(), 200);
        } catch (again) {
          if (again instanceof GenerateError) return json(fallbackAck(parsed, reportedAckReason(again.fallbackReason)), 200);
          if (again instanceof ConfigError) return json({ error: 'misconfigured' }, 500);
          throw again;
        }
      }
      if (error instanceof GenerateError) return json(fallbackAck(parsed, reportedAckReason(error.fallbackReason)), 200);
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
      undefined,
      (error) => (error.fallbackReason === 'line_rejected_shape' ? { body: templateSundayNote(parsed) } : null),
    );
  }

  private async completeDraft<T>(
    messages: readonly { role: 'system' | 'user'; content: string }[],
    schemaName: string,
    schema: JsonSchema,
    parse: (value: unknown) => T,
    maxTokens?: number,
    recover?: (error: GenerateError) => T | null,
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
      if (error instanceof GenerateError) {
        const recovered = recover?.(error) ?? null;
        if (recovered !== null) return json(recovered, 200);
        return json({ error: 'generation_failed' }, 502);
      }
      if (error instanceof ConfigError) return json({ error: 'misconfigured' }, 500);
      throw error;
    }
  }

  private logFallback(fallbackReason: FallbackReason): void {
    this.deps.log?.({
      endpoint: 'intake.profile',
      attempt: 1,
      phase: 'primary',
      provider: this.deps.env.INTAKE_PROFILE_PROVIDER,
      model: this.deps.env.INTAKE_PROFILE_MODEL,
      outcome: 'schema_rejected',
      fallbackReason,
    });
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
      return mockSocialStory(parsed.childName, parsed.church, parsed.lines);
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
    line: { type: 'string', minLength: 1, maxLength: 200 },
    clarifyingPrompt: { type: 'string', minLength: 0, maxLength: 120 },
  },
} satisfies JsonSchema;

interface AckRequest {
  readonly answer: string;
  readonly nodeId: string;
  readonly sectionId: SectionId;
  readonly question: string;
  readonly recent: readonly string[];
}

class RecentRepeat extends SchemaRejected {}

function parseAcknowledgementRequest(value: unknown): AckRequest | null {
  if (!isRecord(value)) return null;
  const keys = Object.keys(value);
  const withRecent = keys.length === 3 && Object.hasOwn(value, 'recent');
  if (keys.length !== 2 && !withRecent) return null;
  if (!Object.hasOwn(value, 'answer') || !Object.hasOwn(value, 'nodeId')) return null;
  if (typeof value.answer !== 'string' || typeof value.nodeId !== 'string') return null;
  const answer = value.answer.trim();
  if (answer.length < 1 || answer.length > 2000) return null;
  const recent = withRecent ? readRecent(value.recent) : [];
  if (recent === null) return null;
  const node = intakeTree.nodes.find((item) => item.id === value.nodeId);
  if (node === undefined || !isSectionId(node.sectionId)) return null;
  return { answer, nodeId: node.id, sectionId: node.sectionId, question: node.prompt, recent };
}

function readRecent(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 3) return null;
  const lines: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || item.length > 200) return null;
    lines.push(item);
  }
  return lines;
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

const ACK_FALLBACKS = [
  'Thank you. That detail can help the volunteers prepare the room for Sunday.',
  "That's really helpful. The team can use this when Sunday gets busy.",
  'Thanks for saying so. This gives the volunteers a concrete place to start.',
  'Noted, and thank you. The room team can keep this in mind on Sunday.',
  'Thank you for that detail. It can help the volunteers prepare the room.',
] as const;

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

function keyboardMash(token: string): boolean {
  if (token.length < 4) return false;
  return ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'].some((row) => row.includes(token));
}

function repeatedLetters(token: string): boolean {
  return token.length >= 3 && /^(.)\1+$/u.test(token);
}

function obviousJunk(answer: string): boolean {
  if (uncertainOrNo(answer)) return false;
  const tokens = answer.toLowerCase().match(/[a-z0-9]+/gu) ?? [];
  if (tokens.some((token) => token === 'tick' || token.startsWith('tick'))) return false;
  const content = tokens.filter((token) => !STOPWORDS.has(token) && !/^\d+$/u.test(token));
  if (content.length === 0 || content.some((token) => CARE.has(token))) return false;
  return content.every(
    (token) => keyboardMash(token) || repeatedLetters(token) || (token.length >= 4 && !/[aeiou]/u.test(token)),
  );
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
    line: mockAckLine(answer, relevant),
    clarifyingPrompt: relevant ? '' : cannedPrompt(sectionId),
  };
}

function acknowledgementMessages(
  request: AckRequest,
  rejection?: FallbackReason,
): { role: 'system' | 'user'; content: string }[] {
  const recent = request.recent.length === 0 ? '' : `\nRecent lines to avoid: ${request.recent.join(' | ')}`;
  const hint = ackRetryHint(rejection);
  const system = hint.length === 0 ? ACKNOWLEDGEMENT_PROMPT : `${ACKNOWLEDGEMENT_PROMPT}\n${hint}`;
  return [
    { role: 'system', content: system },
    {
      role: 'user',
      content: `Answer: ${request.answer}\nSection: ${request.sectionId}\nQuestion: ${request.question}${recent}`,
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
): { relevant: boolean; line: string; clarifyingPrompt: string; fallbackReason?: FallbackReason } {
  if (
    !isRecord(value) ||
    typeof value.line !== 'string' ||
    typeof value.relevant !== 'boolean' ||
    typeof value.clarifyingPrompt !== 'string'
  ) {
    throw new SchemaRejected('schema');
  }
  const line = oneLine(value.line);
  if (line.length < 1) throw new SchemaRejected('schema');
  const relevant =
    !obviousJunk(request.answer) &&
    (value.relevant || careSignal(request.answer) || uncertainOrNo(request.answer));
  const prompt = oneLine(value.clarifyingPrompt);
  const chosen = chooseLine(line, request.answer);
  if (chosen === null) throw new SchemaRejected(lineFallbackReason(line, request.answer));
  if (repeatsRecent(chosen, request.recent)) throw new RecentRepeat();
  return {
    relevant,
    line: chosen,
    clarifyingPrompt: relevant ? '' : promptAccepted(prompt, request.answer) ? prompt : cannedPrompt(request.sectionId),
  };
}

function chooseLine(line: string, answer: string): string | null {
  if (lineAccepted(line, answer)) return line;
  for (const sentence of detailSentences(line)) {
    if (!detailAccepted(sentence, answer) || !namesDetail(sentence, answer)) continue;
    return sentence;
  }
  return null;
}

function detailAccepted(sentence: string, answer: string): boolean {
  if (!surfaceAccepted(sentence, answer)) return false;
  if (!/[.!]$/u.test(sentence)) return false;
  if (sentence.includes('?') || PROMISED_ACK.test(sentence)) return false;
  const words = sentence.trim().split(/\s+/u).length;
  return words >= 1 && words <= 25 && ackSentences(sentence) === 1;
}

function detailSentences(line: string): string[] {
  return (line.match(/[^.!?]+[.!?]+/gu) ?? []).map((sentence) => sentence.trim()).filter((sentence) => sentence.length > 0);
}

function namesDetail(line: string, answer: string): boolean {
  const known = new Set(
    (answer.toLowerCase().match(/\p{L}[\p{L}\p{N}]*/gu) ?? []).filter((word) => word.length >= 3 && !STOPWORDS.has(word)),
  );
  for (const word of line.toLowerCase().match(/\p{L}[\p{L}\p{N}]*/gu) ?? []) {
    if (known.has(word)) return true;
  }
  return false;
}

function allergyAcknowledgement(): { relevant: true; line: string; clarifyingPrompt: '' } {
  return {
    relevant: true,
    line: 'Thank you. The team will see this in your own words before Sunday.',
    clarifyingPrompt: '',
  };
}

function fallbackAck(
  request: AckRequest,
  fallbackReason: FallbackReason,
): { relevant: boolean; line: string; clarifyingPrompt: string; fallbackReason: FallbackReason } {
  const line = fallbackLine(request.recent);
  if (obviousJunk(request.answer)) {
    return { relevant: false, line, clarifyingPrompt: cannedPrompt(request.sectionId), fallbackReason };
  }
  return { relevant: true, line, clarifyingPrompt: '', fallbackReason };
}

function fallbackLine(recent: readonly string[]): string {
  return ACK_FALLBACKS.find((line) => !repeatsRecent(line, recent)) ?? ACK_FALLBACKS[0];
}

function repeatsRecent(line: string, recent: readonly string[]): boolean {
  const text = plain(line);
  const opening = firstWords(line);
  return recent.some((item) => plain(item) === text || firstWords(item) === opening);
}

function firstWords(line: string): string {
  return line
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim()
    .split(/\s+/u)
    .slice(0, 3)
    .join(' ');
}

function oneLine(value: string): string {
  return value.replace(/[\r\n]+/gu, ' ').replace(/ {2,}/gu, ' ').trim();
}

const PROMISED_ACK = /\bwill\b|we['’]ll\b/iu;

function lineAccepted(line: string, answer: string): boolean {
  if (!surfaceAccepted(line, answer)) return false;
  if (!/[.!]$/u.test(line)) return false;
  if (line.includes('?')) return false;
  if (PROMISED_ACK.test(line)) return false;
  const words = line.trim().split(/\s+/u).length;
  if (words < 12 || words > 25) return false;
  const sentences = ackSentences(line);
  return sentences >= 1 && sentences <= 2;
}

function ackSentences(line: string): number {
  const stripped = line.replace(/\b(?:Mr|Mrs|Ms|Dr|St)\./gu, '');
  return stripped.match(/[.!]/gu)?.length ?? 0;
}

function mockAckLine(answer: string, relevant: boolean): string {
  if (!relevant || uncertainOrNo(answer)) return ACK_FALLBACKS[0];
  const detail = ackDetail(answer);
  if (detail === null) return ACK_FALLBACKS[0];
  return `Thank you. Knowing about ${detail} can help the volunteers prepare for Sunday.`;
}

function ackDetail(answer: string): string | null {
  const tokens = (answer.toLowerCase().match(/[a-z0-9]+/gu) ?? []).filter((token) => !STOPWORDS.has(token));
  for (const token of tokens) {
    if (token.length < 4) continue;
    if (CHILD_PRONOUN.test(token)) continue;
    if (ACK_BLOCKED.some((word) => token.includes(word))) continue;
    if (token.includes('allerg') || token.includes('peanut')) continue;
    return token;
  }
  return null;
}

function promptAccepted(prompt: string, answer: string): boolean {
  if (!surfaceAccepted(prompt, answer)) return false;
  return !/\b(?:special|needs)\b/u.test(prompt.toLowerCase());
}

function surfaceAccepted(text: string, answer: string): boolean {
  if (text.length < 1 || text.length > 200) return false;
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
  return answerText.length >= 12 && lineText.includes(answerText);
}

function lineFallbackReason(line: string, answer: string): FallbackReason {
  if (/[^\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]/u.test(line)) return 'safety_script';
  const lower = line.toLowerCase();
  if (ACK_BLOCKED.some((word) => lower.includes(word))) return 'safety_banned_word';
  if (CHILD_PRONOUN.test(line)) return 'safety_pronoun';
  if (line.length > 200) return 'line_rejected_length';
  const words = line.trim().split(/\s+/u).length;
  if (words > 25) return 'line_rejected_words';
  if (PROMISED_ACK.test(line)) return 'line_rejected_shape';
  if (line.includes('?') || (!line.endsWith('.') && !line.endsWith('!'))) return 'line_rejected_shape';
  if (restatesAnswer(line, answer)) return 'line_rejected_restatement';
  if (words < 12 || ackSentences(line) > 2) return 'line_rejected';
  return 'line_rejected_shape';
}

function reportedAckReason(reason: FallbackReason): FallbackReason {
  return reason === 'line_rejected' ? 'line_rejected_shape' : reason;
}

function ackCanRetry(reason: FallbackReason): boolean {
  return ackRetryHint(reason).length > 0;
}

function ackRetryHint(rejection: FallbackReason | undefined): string {
  switch (rejection) {
    case undefined:
      return '';
    case 'line_rejected_words':
    case 'line_rejected_length':
      return `Rejected: ${rejection}. Name one concrete thing in about 12 to 25 words.`;
    case 'line_rejected_shape':
      return 'Rejected: line_rejected_shape. Use one sentence that ends with a period.';
    case 'line_rejected_restatement':
      return 'Rejected: line_rejected_restatement. Name one detail without repeating the whole answer.';
    case 'safety_pronoun':
      return 'Rejected: safety_pronoun. Do not use he, she, her, him, his, or they. Name one detail.';
    case 'safety_banned_word':
      return 'Rejected: safety_banned_word. Do not mention a condition, diagnosis, or disability.';
    case 'safety_script':
      return 'Rejected: safety_script. Use plain English letters.';
    case 'invalid_json':
    case 'truncated':
    case 'schema':
    case 'too_short':
    case 'child_detail_min':
    case 'church_detail':
    case 'safety':
    case 'safety_unknown_name':
    case 'safety_medical':
    case 'safety_allergy':
    case 'upstream_error':
    case 'line_rejected':
    case 'line_rejected_repeat':
      return '';
    default: {
      const leftover: never = rejection;
      return leftover;
    }
  }
}

function plain(value: string): string {
  return value.toLowerCase().replace(/[.!?]+$/u, '').replace(/\s+/gu, ' ').trim();
}

function mockSocialStory(
  childName: string,
  church: StoryChurch,
  lines: readonly { readonly text: string }[],
): { title: string; pages: StoryPages } {
  const details = personalWords(lines, childName);
  const first = details[0];
  const second = details[1];
  const detail = first !== undefined && second !== undefined ? `${first} and ${second}` : `the ${church.room}`;
  return {
    title: `Sunday with ${childName}`.slice(0, 120),
    pages: toldPages(childName, church, detail),
  };
}

function toldPages(childName: string, church: StoryChurch, detail: string): StoryPages {
  const place = church.name;
  const room = church.room;
  const plan = church.plan.trim().replace(/[.!?]+$/u, '');
  const lowered = `${plan.charAt(0).toLowerCase()}${plan.slice(1)}`;
  return {
    arrive: `${childName} and a grown-up go to ${place} for ${church.service}. The morning begins with the plan ${childName} can follow.`,
    doors: `${childName} walks in the front doors at ${place}. A greeter smiles and says hello to ${childName} by name.`,
    desk: `At the welcome desk, ${childName} checks in and gets a name tag. ${childName} can wait there with a grown-up before class.`,
    room: `${childName} goes to the ${room} for ${lowered}. ${childName} can look at the Sunday schedule there.`,
    helper: `${church.leader} and the helpers are in the ${room} with ${childName}. They stay nearby while ${childName} settles in.`,
    quiet: `If ${childName} needs a break, a quiet spot in the ${room} is open. ${childName} can look at ${detail} and rest there.`,
    pickup: `When the time is over, a grown-up comes back to the ${room} for ${childName}. ${childName} can leave with that grown-up.`,
  };
}

function personalWords(lines: readonly { readonly text: string }[], childName: string): string[] {
  const skip = new Set(childName.toLowerCase().match(/\p{L}[\p{L}\p{N}]*/gu) ?? []);
  const seen = new Set<string>();
  const words: string[] = [];
  for (const line of lines) {
    for (const word of line.text.toLowerCase().match(/\p{L}[\p{L}\p{N}]*/gu) ?? []) {
      if (word.length < 4 || skip.has(word) || seen.has(word) || !storyTokenAllowed(word)) continue;
      seen.add(word);
      words.push(word);
      if (words.length === 2) return words;
    }
  }
  return words;
}

function mockSundayUpdate(childName: string, leader: string, church: string): { body: string } {
  return { body: finishSundayNote(`Hi, Sunday went well for ${childName}.`, leader, church) };
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
    whatHelps: mockWhatHelps(answers),
  };
}

function mockWhatHelps(answers: IntakeAnswers): string[] {
  const name = answers.preferredName.trim().slice(0, 40);
  const kept = filterWhatHelps([answers.whatHelps, answers.supportNeeds, answers.sensoryNotes].map(clipBullet));
  const fillers = [
    `Give ${name} a moment before the next thing.`,
    `Stay nearby if ${name} needs a break.`,
    `Show ${name} what happens next.`,
  ];
  const bullets = [...kept];
  for (const filler of fillers) {
    if (bullets.length >= 3) break;
    bullets.push(filler);
  }
  return [...filterWhatHelps(bullets)].slice(0, 5);
}

function clipBullet(value: string): string {
  const sentence = value.split(/(?<=[.!?])\s/u)[0] ?? value;
  return sentence.trim().split(/\s+/u).slice(0, 16).join(' ').slice(0, 110);
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
