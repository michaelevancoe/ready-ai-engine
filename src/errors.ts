export class InputError extends Error {
  constructor() {
    super('invalid input');
    this.name = 'InputError';
  }
}

export class ConfigError extends Error {
  constructor() {
    super('gateway configuration is incomplete');
    this.name = 'ConfigError';
  }
}

export const FALLBACK_REASONS = [
  'invalid_json',
  'truncated',
  'schema',
  'preamble_only',
  'too_short',
  'child_detail_min',
  'church_detail',
  'safety',
  'safety_unknown_name',
  'safety_banned_word',
  'safety_medical',
  'safety_allergy',
  'safety_pronoun',
  'safety_script',
  'upstream_error',
  'line_rejected',
  'line_rejected_words',
  'line_rejected_length',
  'line_rejected_shape',
  'line_rejected_restatement',
  'line_rejected_repeat',
] as const;

export type FallbackReason = (typeof FALLBACK_REASONS)[number];

export class SchemaRejected extends Error {
  readonly fallbackReason: FallbackReason;

  constructor(fallbackReason: FallbackReason = 'schema') {
    super('schema rejected');
    this.name = 'SchemaRejected';
    this.fallbackReason = fallbackReason;
  }
}

export class GatewayRejected extends Error {
  readonly status: number;
  readonly retryAfter: string | null;

  constructor(status = 0, retryAfter: string | null = null) {
    super('gateway rejected');
    this.name = 'GatewayRejected';
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export type GenerateFailure = 'schema' | 'gateway';

export class GenerateError extends Error {
  readonly reason: GenerateFailure;
  readonly fallbackReason: FallbackReason;

  constructor(reason: GenerateFailure, fallbackReason?: FallbackReason) {
    super('generation failed');
    this.name = 'GenerateError';
    this.reason = reason;
    this.fallbackReason = fallbackReason ?? (reason === 'gateway' ? 'upstream_error' : 'schema');
  }
}

export class StoreError extends Error {
  readonly status: number;

  constructor(status: number) {
    super('store request failed');
    this.name = 'StoreError';
    this.status = status;
  }
}

export class UpstreamError extends Error {
  readonly status: 503 | 504;

  constructor(status: 503 | 504) {
    super(status === 504 ? 'timeout' : 'unavailable');
    this.name = 'UpstreamError';
    this.status = status;
  }
}
