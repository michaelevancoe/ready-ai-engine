import type { WorkerBindings } from '../src/bindings.ts';
import { handleRequest, type AppDeps } from '../src/app.ts';
import {
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
  type LessonRequest,
  type SocialStoryRequest,
  type SundayUpdateRequest,
} from '../src/demo-drafts.ts';
import { ConfigError, GenerateError } from '../src/errors.ts';
import { generate } from '../src/generate.ts';
import { json } from '../src/http.ts';
import { parseIntake, type IntakeAnswers } from '../src/intake.ts';
import { signHs256 } from '../src/jwt.ts';
import { emitSafe } from '../src/log.ts';
import { childProfileSchemaName, type ChildProfile } from '../src/profile.ts';
import { isRecord, type JsonSchema } from '../src/schema.ts';
import { chatEnvelope, churchStore, ids, testEnv, type MemoryStore } from '../test/fixtures.ts';
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

  private async handleSundayUpdate(request: Request): Promise<Response> {
    const parsed = await parsedBody(request, parseSundayUpdateRequest);
    if (parsed instanceof Response) return parsed;
    return this.completeDraft(
      sundayUpdateMessages(parsed),
      sundayUpdateSchemaName,
      sundayUpdateSchema,
      parseSundayUpdate,
    );
  }

  private async completeDraft<T>(
    messages: readonly { role: 'system' | 'user'; content: string }[],
    schemaName: string,
    schema: JsonSchema,
    parse: (value: unknown) => T,
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
  const user = userJson(payload);
  if (user === null) return new Response(null, { status: 502 });
  const content = mockDraft(name, user);
  if (content === null) return new Response(null, { status: 502 });
  return chatEnvelope(content);
};

function schemaName(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  const format = payload.response_format;
  if (!isRecord(format)) return null;
  const spec = format.json_schema;
  if (!isRecord(spec) || typeof spec.name !== 'string' || spec.name.length === 0) return null;
  return spec.name;
}

function userJson(payload: unknown): unknown | null {
  if (!isRecord(payload) || !Array.isArray(payload.messages)) return null;
  let content: string | null = null;
  for (const message of payload.messages) {
    if (isRecord(message) && message.role === 'user' && typeof message.content === 'string') {
      content = message.content;
    }
  }
  if (content === null) return null;
  try {
    return JSON.parse(content) as unknown;
  } catch {
    return null;
  }
}

function mockDraft(name: string, user: unknown): unknown | null {
  switch (name) {
    case socialStorySchemaName: {
      const parsed = parseSocialStoryRequest(user);
      if (parsed === null) return null;
      return mockSocialStory(parsed);
    }
    case lessonSchemaName: {
      const parsed = parseLessonRequest(user);
      if (parsed === null) return null;
      return mockLesson(parsed);
    }
    case sundayUpdateSchemaName: {
      const parsed = parseSundayUpdateRequest(user);
      if (parsed === null) return null;
      return mockSundayUpdate(parsed);
    }
    default:
      return null;
  }
}

function mockSocialStory(input: SocialStoryRequest): { title: string; body: string } {
  return {
    title: 'Sunday with Rowan',
    body: input.lines.map((line) => line.text).join('\n').slice(0, 2000),
  };
}

function mockLesson(input: LessonRequest): { summary: string; steps: string[] } {
  const steps = [input.lesson.slice(0, 400)];
  for (const line of input.lines) {
    if (steps.length >= 8) break;
    steps.push(line.text.slice(0, 400));
  }
  return { summary: input.lesson.slice(0, 600), steps };
}

function mockSundayUpdate(input: SundayUpdateRequest): { body: string } {
  const name = input.childName;
  const room = 2000 - name.length - 1;
  const notes = room > 0 ? input.notes.slice(0, room) : '';
  return { body: notes.length === 0 ? name.slice(0, 2000) : `${notes}\n${name}` };
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
