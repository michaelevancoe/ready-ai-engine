import type { WorkerBindings } from './bindings.ts';
import { ConfigError } from './errors.ts';

const COMPAT_CHAT_PATH = '/compat/chat/completions';

export interface ModelTarget {
  provider: string;
  model: string;
}

export type EndpointId = 'intake.profile';

export function modelTargets(
  env: WorkerBindings,
  endpoint: EndpointId,
): { primary: ModelTarget; fallback: ModelTarget } {
  switch (endpoint) {
    case 'intake.profile':
      return {
        primary: { provider: env.INTAKE_PROFILE_PROVIDER, model: env.INTAKE_PROFILE_MODEL },
        fallback: {
          provider: env.INTAKE_PROFILE_FALLBACK_PROVIDER,
          model: env.INTAKE_PROFILE_FALLBACK_MODEL,
        },
      };
    default: {
      const neverEndpoint: never = endpoint;
      throw new Error(`unknown endpoint ${String(neverEndpoint)}`);
    }
  }
}

function requireTarget(target: ModelTarget): void {
  if (target.provider.trim() === '' || target.provider.includes('/')) throw new ConfigError();
  if (target.model.trim() === '') throw new ConfigError();
}

export function gatewayChatCompletionsUrl(env: WorkerBindings): string {
  if (
    env.AI_GATEWAY_BASE_URL.trim() === '' ||
    env.AI_GATEWAY_ACCOUNT_ID.trim() === '' ||
    env.AI_GATEWAY_ID.trim() === '' ||
    env.AI_GATEWAY_TOKEN.trim() === ''
  ) {
    throw new ConfigError();
  }
  let base: URL;
  try {
    base = new URL(env.AI_GATEWAY_BASE_URL);
  } catch {
    throw new ConfigError();
  }
  if (base.protocol !== 'https:') throw new ConfigError();
  const path = base.pathname.replace(/\/+$/, '');
  const account = encodeURIComponent(env.AI_GATEWAY_ACCOUNT_ID);
  const gateway = encodeURIComponent(env.AI_GATEWAY_ID);
  return `${base.origin}${path}/${account}/${gateway}${COMPAT_CHAT_PATH}`;
}

export function assertTargets(targets: { primary: ModelTarget; fallback: ModelTarget }): void {
  requireTarget(targets.primary);
  requireTarget(targets.fallback);
}
