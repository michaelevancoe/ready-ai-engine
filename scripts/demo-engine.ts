import type { WorkerBindings } from '../src/bindings.ts';
import { handleRequest, type AppDeps } from '../src/app.ts';
import { json } from '../src/http.ts';
import { parseIntake, type IntakeAnswers } from '../src/intake.ts';
import { signHs256 } from '../src/jwt.ts';
import { emitSafe } from '../src/log.ts';
import type { ChildProfile } from '../src/profile.ts';
import { isRecord } from '../src/schema.ts';
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
    return new DemoContext(liveDemoBindings(env), fetchImpl);
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
    return json({ error: 'not_found' }, 404);
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
  const answers = answersFromGateway(payload);
  if (answers === null) return new Response(null, { status: 502 });
  return chatEnvelope(profileFromAnswers(answers));
};

function answersFromGateway(payload: unknown): IntakeAnswers | null {
  if (!isRecord(payload) || !Array.isArray(payload.messages)) return null;
  let content: string | null = null;
  for (const message of payload.messages) {
    if (isRecord(message) && message.role === 'user' && typeof message.content === 'string') {
      content = message.content;
    }
  }
  if (content === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch {
    return null;
  }
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
