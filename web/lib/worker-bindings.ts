const BINDING_KEYS = [
  'READY_SIGN_IN',
  'READY_MODE',
  'READY_DEMO_MODEL',
  'AI_GATEWAY_BASE_URL',
  'AI_GATEWAY_ACCOUNT_ID',
  'AI_GATEWAY_ID',
  'AI_GATEWAY_TOKEN',
  'INTAKE_PROFILE_PROVIDER',
  'INTAKE_PROFILE_MODEL',
  'INTAKE_PROFILE_FALLBACK_PROVIDER',
  'INTAKE_PROFILE_FALLBACK_MODEL',
] as const;

export function readWorkerBindings(source: object): Record<string, string | undefined> {
  const record = source as Record<string, unknown>;
  const bindings: Record<string, string | undefined> = {};
  for (const key of BINDING_KEYS) {
    const value = record[key];
    bindings[key] = typeof value === 'string' ? value : undefined;
  }
  return bindings;
}
