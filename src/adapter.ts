import { signInEnabled } from './access.ts';
import { ConfigError } from './errors.ts';

export type StoreAdapter = 'memory' | 'supabase';

export function accountMode(env: { READY_SIGN_IN?: string; READY_MODE?: string }): boolean {
  return signInEnabled(env.READY_SIGN_IN) || env.READY_MODE === 'account';
}

function modeOf(env: object): { READY_SIGN_IN?: string; READY_MODE?: string } {
  const record = env as { READY_SIGN_IN?: unknown; READY_MODE?: unknown };
  return {
    READY_SIGN_IN: typeof record.READY_SIGN_IN === 'string' ? record.READY_SIGN_IN : undefined,
    READY_MODE: typeof record.READY_MODE === 'string' ? record.READY_MODE : undefined,
  };
}

export function assertAdapterAllowed(env: object, adapter: StoreAdapter): void {
  if (adapter === 'memory' && accountMode(modeOf(env))) throw new ConfigError();
}
