export type LogPhase = 'primary' | 'retry' | 'fallback';

export type LogOutcome = 'success' | 'schema_rejected' | 'error';

export interface SafeLog {
  endpoint: string;
  attempt: number;
  phase: LogPhase;
  provider: string;
  model: string;
  outcome: LogOutcome;
}

const SAFE_KEYS = ['endpoint', 'attempt', 'phase', 'provider', 'model', 'outcome'] as const;

export function emitSafe(event: SafeLog): void {
  const payload: Record<string, string | number> = {};
  for (const key of SAFE_KEYS) {
    payload[key] = event[key];
  }
  const line = JSON.stringify(payload);
  if (event.outcome === 'success') console.log(line);
  else console.error(line);
}
