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

export class SchemaRejected extends Error {
  constructor() {
    super('schema rejected');
    this.name = 'SchemaRejected';
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

  constructor(reason: GenerateFailure) {
    super('generation failed');
    this.name = 'GenerateError';
    this.reason = reason;
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
