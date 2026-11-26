import type { WorkerBindings } from './bindings.ts';
import {
  GatewayRejected,
  GenerateError,
  SchemaRejected,
  type GenerateFailure,
} from './errors.ts';
import { assertTargets, gatewayChatCompletionsUrl, modelTargets, type EndpointId, type ModelTarget } from './gateway.ts';
import { emitSafe, type LogPhase, type SafeLog } from './log.ts';
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
}

interface Attempt {
  target: ModelTarget;
  phase: LogPhase;
}

const MAX_RESPONSE_CHARS = 100_000;

const GATEWAY_RETRY_DELAY_MS = 300;

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
  } catch {
    throw new GatewayRejected();
  }

  if (!response.ok) {
    await response.body?.cancel();
    throw new GatewayRejected();
  }
  const text = await response.text();
  if (text.length > MAX_RESPONSE_CHARS) throw new SchemaRejected();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new SchemaRejected();
  }
}

function failureReason(error: unknown): GenerateFailure | null {
  if (error instanceof SchemaRejected) return 'schema';
  if (error instanceof GatewayRejected) return 'gateway';
  return null;
}

export async function generate<T>(input: GenerateInput<T>): Promise<T> {
  const targets = modelTargets(input.env, input.endpoint);
  assertTargets(targets);
  gatewayChatCompletionsUrl(input.env);

  const plan: readonly Attempt[] = [
    { target: targets.primary, phase: 'primary' },
    { target: targets.primary, phase: 'retry' },
    { target: targets.fallback, phase: 'fallback' },
  ];

  let lastReason: GenerateFailure = 'gateway';
  let waitedForGateway = false;
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
      let decoded: unknown;
      try {
        decoded = JSON.parse(content) as unknown;
      } catch {
        throw new SchemaRejected();
      }
      const value = input.parse(decoded);
      report(input.log, { ...base, outcome: 'success' });
      return value;
    } catch (error) {
      const reason = failureReason(error);
      if (reason === null) throw error;
      lastReason = reason;
      report(input.log, {
        ...base,
        outcome: reason === 'schema' ? 'schema_rejected' : 'error',
      });
      if (index === plan.length - 1) throw new GenerateError(lastReason);
      if (reason === 'gateway' && !waitedForGateway) {
        waitedForGateway = true;
        await new Promise((resolve) => {
          setTimeout(resolve, GATEWAY_RETRY_DELAY_MS);
        });
      }
    }
  }
  throw new GenerateError(lastReason);
}
