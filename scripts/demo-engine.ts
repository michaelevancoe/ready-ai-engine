import type { WorkerBindings } from '../src/bindings.ts';
import { handleRequest, type AppDeps } from '../src/app.ts';
import {
  DEMO_VOLUNTEER_NAME,
  lessonMessages,
  lessonSchema,
  lessonSchemaName,
  parseLesson,
  parseLessonRequest,
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
} from '../src/demo-drafts.ts';
import { ConfigError, GenerateError, SchemaRejected } from '../src/errors.ts';
import { generate } from '../src/generate.ts';
import { json } from '../src/http.ts';
import { parseIntake, type IntakeAnswers } from '../src/intake.ts';
import { signHs256 } from '../src/jwt.ts';
import { emitSafe } from '../src/log.ts';
import { childProfileSchemaName, type ChildProfile } from '../src/profile.ts';
import { isRecord, type JsonSchema } from '../src/schema.ts';
import { chatEnvelope, churchStore, ids, testEnv, type MemoryStore } from '../test/fixtures.ts';
import { SECTION_IDS } from '../web/lib/intake-tree.ts';
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

export class DemoContext {
  private readonly store: MemoryStore;
  private readonly deps: AppDeps;

  private constructor(env: WorkerBindings, fetchImpl: typeof fetch) {
    this.store = churchStore();
    this.deps = {
      env,
      fetch: fetchImpl,
      storeFactory: () => this.store,
      log: emitSafe,
      now: () => Date.now(),
    };
  }

  static fromBindings(
    env: Readonly<Record<string, string | undefined>>,
    fetchImpl: typeof fetch = globalThis.fetch,
  ): DemoContext {
    const mode = demoModelMode(env.READY_DEMO_MODEL);
    switch (mode) {
      case 'mock':
        return new DemoContext(testEnv, mockGateway);
      case 'live':
        return new DemoContext(liveDemoBindings(env), fetchImpl);
      default: {
        const unexpected: never = mode;
        return unexpected;
      }
    }
  }

  static async open(envValue: string | undefined, options?: DemoOpenOptions): Promise<DemoContext> {
    if (!localDemoEnabled(envValue)) throw new Error('READY_LOCAL_DEMO is off');
    if (options?.fromEnvironment !== true) return new DemoContext(testEnv, mockGateway);
    const merged = mergeDemoEnv(devVarsLayer(options), options.shell ?? process.env);
    const mode = demoModelMode(options.model !== undefined ? options.model : merged.READY_DEMO_MODEL);
    switch (mode) {
      case 'mock':
        return new DemoContext(testEnv, mockGateway);
      case 'live':
        return new DemoContext(liveDemoBindings(merged), options.fetchImpl ?? globalThis.fetch);
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
    if (request.method === 'POST' && url.pathname === '/v1/drafts/lesson') {
      return this.handleLesson(request);
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
    return this.completeDraft(socialStoryMessages(parsed), socialStorySchemaName, socialStorySchema, parseSocialStory);
  }

  private async handleLesson(request: Request): Promise<Response> {
    const parsed = await parsedBody(request, parseLessonRequest);
    if (parsed instanceof Response) return parsed;
    return this.completeDraft(lessonMessages(parsed), lessonSchemaName, lessonSchema, parseLesson);
  }

  private async handleAcknowledgement(request: Request): Promise<Response> {
    const parsed = await parsedBody(request, parseAcknowledgementRequest);
    if (parsed instanceof Response) return parsed;
    return this.completeDraft(
      acknowledgementMessages(parsed),
      intakeAcknowledgementSchemaName,
      acknowledgementSchema,
      parseAcknowledgement,
      60,
    );
  }

  private async handleSundayUpdate(request: Request): Promise<Response> {
    const parsed = await parsedBody(request, parseSundayUpdateRequest);
    if (parsed instanceof Response) return parsed;
    return this.completeDraft(
      sundayUpdateMessages(parsed),
      sundayUpdateSchemaName,
      sundayUpdateSchema,
      (value) => parseSundayUpdate(value, parsed.notes, parsed.childName),
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
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = await signHs256({ sub: ids.avery, exp }, testEnv.SUPABASE_JWT_SECRET);
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
      return mockSocialStory(parsed.childName, parsed.lines);
    }
    case lessonSchemaName: {
      const parsed = readLesson(content);
      if (parsed === null) return null;
      return mockLesson(parsed.childName, parsed.lesson, parsed.lines);
    }
    case sundayUpdateSchemaName: {
      const parsed = readSunday(content);
      if (parsed === null) return null;
      return mockSundayUpdate(parsed.childName, parsed.notes);
    }
    case intakeAcknowledgementSchemaName: {
      const answer = acknowledgementAnswer(content);
      if (answer === null) return null;
      return { line: 'Thanks. That helps.' };
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

function readSocial(content: string): { childName: string; lines: { text: string }[] } | null {
  const head = readChild(content);
  if (head === null) return null;
  const lines = readLabeled(head.rest);
  if (lines === null || lines.length < 1) return null;
  return { childName: head.childName, lines };
}

function readSunday(content: string): { childName: string; notes: string } | null {
  const head = readChild(content);
  const notesPrefix = `Volunteer: ${DEMO_VOLUNTEER_NAME}\nNotes:\n`;
  if (head === null || !head.rest.startsWith(notesPrefix)) return null;
  return { childName: head.childName, notes: head.rest.slice(notesPrefix.length) };
}

function readLesson(
  content: string,
): { childName: string; lesson: string; lines: { text: string }[] } | null {
  const head = readChild(content);
  if (head === null || !head.rest.startsWith('Lesson:\n')) return null;
  const after = head.rest.slice('Lesson:\n'.length);
  const marker = '\nApproved needs:\n';
  const at = after.indexOf(marker);
  if (at < 0) return null;
  const lesson = after.slice(0, at);
  if (lesson.length < 1) return null;
  const lines = readLabeled(after.slice(at + marker.length));
  if (lines === null) return null;
  return { childName: head.childName, lesson, lines };
}

const intakeAcknowledgementSchemaName = 'intake_acknowledgement';

const acknowledgementSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['line'],
  properties: {
    line: { type: 'string', minLength: 1, maxLength: 160 },
  },
} satisfies JsonSchema;

function parseAcknowledgementRequest(value: unknown): { answer: string; sectionId: (typeof SECTION_IDS)[number] } | null {
  if (!isRecord(value)) return null;
  const keys = Object.keys(value);
  if (keys.length !== 2 || !Object.hasOwn(value, 'answer') || !Object.hasOwn(value, 'sectionId')) return null;
  if (typeof value.answer !== 'string') return null;
  const answer = value.answer.trim();
  if (answer.length < 1 || answer.length > 500) return null;
  if (!isAcknowledgementSection(value.sectionId)) return null;
  return { answer, sectionId: value.sectionId };
}

function isAcknowledgementSection(value: unknown): value is (typeof SECTION_IDS)[number] {
  return typeof value === 'string' && SECTION_IDS.some((id) => id === value);
}

function acknowledgementMessages(request: { answer: string; sectionId: (typeof SECTION_IDS)[number] }): {
  role: 'system' | 'user';
  content: string;
}[] {
  return [
    {
      role: 'system',
      content:
        'The data is fictional. Do not invent medical facts. Write one sentence. Do not ask a question. Do not rewrite the next question.',
    },
    { role: 'user', content: `Answer: ${request.answer}\nSection: ${request.sectionId}` },
  ];
}

function acknowledgementAnswer(content: string): string | null {
  const marker = 'Answer: ';
  const section = '\nSection: ';
  if (!content.startsWith(marker)) return null;
  const at = content.indexOf(section);
  if (at < marker.length) return null;
  const answer = content.slice(marker.length, at).trim();
  return answer.length === 0 ? null : answer;
}

function parseAcknowledgement(value: unknown): { line: string } {
  if (!isRecord(value) || typeof value.line !== 'string' || value.line.length < 1 || value.line.length > 160) {
    throw new SchemaRejected();
  }
  return { line: value.line };
}

function clip(value: string, max: number): string {
  return value.slice(0, max);
}

function mockSocialStory(childName: string, lines: { text: string }[]): { title: string; body: string } {
  const told = lines.map((line) => line.text).join(' ');
  const body = `${childName} arrives and finds a quiet place in the room. ${told}`.slice(0, 2000);
  return { title: `Sunday with ${childName}`.slice(0, 120), body };
}

function mockLesson(
  childName: string,
  lesson: string,
  lines: { text: string }[],
): { summary: string; steps: string[] } {
  const steps: string[] = [];
  for (const line of lesson.split('\n')) {
    if (line.trim().length === 0 || steps.length >= 8) continue;
    steps.push(clip(`${childName} ${line}`, 400));
  }
  for (const line of lines) {
    if (steps.length >= 8) break;
    steps.push(clip(`${childName} ${line.text}`, 400));
  }
  if (steps.length === 0) steps.push(clip(childName, 400));
  return { summary: clip(`${childName} ${lesson}`.trim(), 600), steps };
}

function mockSundayUpdate(childName: string, _notes: string): { body: string } {
  const signature = `\n${DEMO_VOLUNTEER_NAME}`;
  const told = `Sunday went well for ${childName}.`.slice(0, 2000 - signature.length);
  return { body: `${told}${signature}` };
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
