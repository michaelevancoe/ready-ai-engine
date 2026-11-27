export type LogPhase = 'primary' | 'retry' | 'fallback';

export type LogOutcome = 'success' | 'schema_rejected' | 'error';

export type StatusClass = '429' | '5xx' | 'other';

export interface SafeLog {
  endpoint: string;
  attempt: number;
  phase: LogPhase;
  provider: string;
  model: string;
  outcome: LogOutcome;
  statusClass?: StatusClass;
}

const SAFE_KEYS = ['endpoint', 'attempt', 'phase', 'provider', 'model', 'outcome', 'statusClass'] as const;

export function emitSafe(event: SafeLog): void {
  const payload: Record<string, string | number> = {};
  for (const key of SAFE_KEYS) {
    const value = event[key];
    if (value !== undefined) payload[key] = value;
  }
  const line = JSON.stringify(payload);
  if (event.outcome === 'success') console.log(line);
  else console.error(line);
}
