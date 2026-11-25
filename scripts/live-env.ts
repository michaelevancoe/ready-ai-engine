import type { WorkerBindings } from '../src/bindings.ts';
import { ConfigError } from '../src/errors.ts';
import { assertTargets, gatewayChatCompletionsUrl, modelTargets } from '../src/gateway.ts';
import { fictionalDemoEnv } from '../src/demo-env.ts';

export function parseDevVars(text: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const raw of text.split('\n')) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
    const splitAt = line.indexOf('=');
    if (splitAt === -1) continue;
    const key = line.slice(0, splitAt).trim();
    if (key === '') continue;
    let value = line.slice(splitAt + 1).trim();
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

export function mergeDemoEnv(
  file: Readonly<Record<string, string>>,
  shell: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
  const merged: Record<string, string> = { ...file };
  for (const [key, value] of Object.entries(shell)) {
    if (value !== undefined) merged[key] = value;
  }
  return merged;
}

type FictionalDemoSession = Pick<
  WorkerBindings,
  'SUPABASE_URL' | 'SUPABASE_ANON_KEY' | 'SUPABASE_JWT_SECRET'
>;

function required(env: Readonly<Record<string, string | undefined>>, key: string): string {
  const value = env[key];
  if (value === undefined || value.trim() === '') throw new ConfigError();
  return value;
}

function fictionalDemoSession(): FictionalDemoSession {
  return {
    SUPABASE_URL: fictionalDemoEnv.SUPABASE_URL,
    SUPABASE_ANON_KEY: fictionalDemoEnv.SUPABASE_ANON_KEY,
    SUPABASE_JWT_SECRET: fictionalDemoEnv.SUPABASE_JWT_SECRET,
  };
}

export function liveDemoBindings(env: Readonly<Record<string, string | undefined>>): WorkerBindings {
  const bindings: WorkerBindings = {
    AI_GATEWAY_BASE_URL: required(env, 'AI_GATEWAY_BASE_URL'),
    AI_GATEWAY_ACCOUNT_ID: required(env, 'AI_GATEWAY_ACCOUNT_ID'),
    AI_GATEWAY_ID: required(env, 'AI_GATEWAY_ID'),
    AI_GATEWAY_TOKEN: required(env, 'AI_GATEWAY_TOKEN'),
    ...fictionalDemoSession(),
    INTAKE_PROFILE_PROVIDER: required(env, 'INTAKE_PROFILE_PROVIDER'),
    INTAKE_PROFILE_MODEL: required(env, 'INTAKE_PROFILE_MODEL'),
    INTAKE_PROFILE_FALLBACK_PROVIDER: required(env, 'INTAKE_PROFILE_FALLBACK_PROVIDER'),
    INTAKE_PROFILE_FALLBACK_MODEL: required(env, 'INTAKE_PROFILE_FALLBACK_MODEL'),
  };
  if (bindings.INTAKE_PROFILE_PROVIDER !== 'workers-ai') throw new ConfigError();
  if (bindings.INTAKE_PROFILE_FALLBACK_PROVIDER !== 'workers-ai') throw new ConfigError();
  assertTargets(modelTargets(bindings, 'intake.profile'));
  gatewayChatCompletionsUrl(bindings);
  return bindings;
}
