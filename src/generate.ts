import type { WorkerBindings } from './bindings.ts';
import {
  GatewayRejected,
  GenerateError,
  SchemaRejected,
  type FallbackReason,
  type GenerateFailure,
} from './errors.ts';
import { assertTargets, gatewayChatCompletionsUrl, modelTargets, type EndpointId, type ModelTarget } from './gateway.ts';
import { emitSafe, type LogPhase, type SafeLog, type StatusClass } from './log.ts';
import type { JsonSchema } from './schema.ts';
import { isRecord } from './schema.ts';

export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

export interface GenerateInput<T> {
  endpoint: EndpointId;
  messages: readonly ChatMessage[];
  schemaName: string;
  schema: JsonSchema;
  parse: (value: unknown) => T;
  env: WorkerBindings;
  fetch: typeof fetch;
  log?: (event: SafeLog) => void;
  maxTokens?: number;
  attempts?: 'once';
  sleep?: (ms: number) => Promise<void>;
}

interface Attempt {
  target: ModelTarget;
  phase: LogPhase;
}

const MAX_RESPONSE_CHARS = 100_000;

const SHORT_BACKOFF_MS = 300;
const WAIT_CAP_MS = 8_000;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function retryAfterMs(header: string | null): number | null {
  if (header === null) return null;
  const trimmed = header.trim();
  if (!/^\d+(?:\.\d+)?$/.test(trimmed)) {
    const when = Date.parse(trimmed);
    if (Number.isNaN(when)) return null;
    return Math.max(0, when - Date.now());
  }
  return Math.round(Number(trimmed) * 1000);
}

function statusClass(status: number): StatusClass {
  if (status === 429) return '429';
  if (status >= 500 && status <= 599) return '5xx';
  return 'other';
}

function waitMs(error: unknown, waited: number): number {
  if (!(error instanceof GatewayRejected)) return 0;
  const room = WAIT_CAP_MS - waited;
  if (room <= 0) return 0;
  if (error.status === 429 || (error.status >= 500 && error.status <= 599)) {
    return Math.min(retryAfterMs(error.retryAfter) ?? SHORT_BACKOFF_MS, room);
  }
  if (waited === 0) return Math.min(SHORT_BACKOFF_MS, room);
  return 0;
}

function report(log: ((event: SafeLog) => void) | undefined, event: SafeLog): void {
  (log ?? emitSafe)(event);
}

function extractContent(value: unknown): string {
  if (!isRecord(value) || !Array.isArray(value.choices) || value.choices.length === 0) {
    throw new SchemaRejected();
  }
  const first = value.choices[0];
  if (!isRecord(first) || !isRecord(first.message) || typeof first.message.content !== 'string') {
    throw new SchemaRejected();
  }
  return first.message.content;
}

async function callGateway(
  env: WorkerBindings,
  fetchImpl: typeof fetch,
  target: ModelTarget,
  messages: readonly ChatMessage[],
  schemaName: string,
  schema: JsonSchema,
  maxTokens: number | undefined,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(gatewayChatCompletionsUrl(env), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'cf-aig-authorization': `Bearer ${env.AI_GATEWAY_TOKEN}`,
        'cf-aig-collect-log-payload': 'false',
      },
      body: JSON.stringify({
        model: `${target.provider}/${target.model}`,
        messages,
        ...(maxTokens === undefined ? {} : { max_tokens: maxTokens }),
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: schemaName,
            strict: true,
            schema,
          },
        },
      }),
    });
  } catch (error) {
    if (error instanceof GatewayRejected) throw error;
    throw new GatewayRejected();
  }

  if (!response.ok) {
    const retryAfter = response.headers.get('retry-after');
    const status = response.status;
    await response.body?.cancel();
    throw new GatewayRejected(status, retryAfter);
  }
  const text = await response.text();
  if (text.length > MAX_RESPONSE_CHARS) throw new SchemaRejected();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new SchemaRejected();
  }
}

export async function generate<T>(input: GenerateInput<T>): Promise<T> {
  const targets = modelTargets(input.env, input.endpoint);
  assertTargets(targets);
  gatewayChatCompletionsUrl(input.env);

  const plan: readonly Attempt[] =
    input.attempts === 'once'
      ? [{ target: targets.primary, phase: 'primary' }]
      : [
          { target: targets.primary, phase: 'primary' },
          { target: targets.primary, phase: 'retry' },
          { target: targets.fallback, phase: 'fallback' },
        ];
  const sleep = input.sleep ?? defaultSleep;

  let lastReason: GenerateFailure = 'gateway';
  let lastFallback: FallbackReason = 'upstream_error';
  let waited = 0;
  for (const [index, step] of plan.entries()) {
    const base = {
      endpoint: input.endpoint,
      attempt: index + 1,
      phase: step.phase,
      provider: step.target.provider,
      model: step.target.model,
    };
    try {
      const envelope = await callGateway(
        input.env,
        input.fetch,
        step.target,
        input.messages,
        input.schemaName,
        input.schema,
        input.maxTokens,
      );
      const content = extractContent(envelope);
      const decoded = decodeModelJson(content);
      const value = input.parse(decoded);
      report(input.log, { ...base, outcome: 'success' });
      return value;
    } catch (error) {
      const reason = failureReason(error);
      if (reason === null) throw error;
      lastReason = reason.gate;
      lastFallback = reason.fallbackReason;
      report(input.log, {
        ...base,
        outcome: reason.gate === 'schema' ? 'schema_rejected' : 'error',
        fallbackReason: reason.fallbackReason,
        ...(error instanceof GatewayRejected ? { statusClass: statusClass(error.status) } : {}),
      });
      if (index === plan.length - 1) throw new GenerateError(lastReason, lastFallback);
      const pause = waitMs(error, waited);
      if (pause > 0) {
        await sleep(pause);
        waited += pause;
      } else if (
        error instanceof GatewayRejected &&
        (error.status === 429 || (error.status >= 500 && error.status <= 599)) &&
        waited >= WAIT_CAP_MS
      ) {
        throw new GenerateError(lastReason, lastFallback);
      }
    }
  }
  throw new GenerateError(lastReason, lastFallback);
}

function failureReason(error: unknown): { gate: GenerateFailure; fallbackReason: FallbackReason } | null {
  if (error instanceof SchemaRejected) return { gate: 'schema', fallbackReason: error.fallbackReason };
  if (error instanceof GatewayRejected) return { gate: 'gateway', fallbackReason: 'upstream_error' };
  return null;
}

function decodeModelJson(content: string): unknown {
  const stripped = stripFence(content).trim();
  const direct = tryParse(stripped);
  if (direct !== undefined) return direct;
  const start = stripped.indexOf('{');
  if (start < 0) throw new SchemaRejected('invalid_json');
  const balanced = balancedObject(stripped, start);
  if (balanced !== null) {
    const parsed = tryParse(balanced);
    if (parsed !== undefined) return parsed;
  }
  const repaired = tryParse(repairJson(stripped.slice(start)));
  if (repaired !== undefined) return repaired;
  throw new SchemaRejected('invalid_json');
}

function stripFence(content: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/iu.exec(content);
  if (fenced?.[1] !== undefined) return fenced[1];
  return content;
}

function tryParse(text: string): unknown | undefined {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function balancedObject(text: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index] ?? '';
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (char === '\\') {
        escape = true;
        continue;
      }
      if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return null;
}

function repairJson(text: string): string {
  let out = '';
  const stack: string[] = [];
  let inString = false;
  let escape = false;
  for (const char of text) {
    out += char;
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (char === '\\') {
        escape = true;
        continue;
      }
      if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{' || char === '[') stack.push(char === '{' ? '}' : ']');
    else if ((char === '}' || char === ']') && stack[stack.length - 1] === char) stack.pop();
  }
  if (inString) out += '"';
  out = out.replace(/,\s*$/u, '');
  while (stack.length > 0) out += stack.pop() ?? '';
  return out;
}
