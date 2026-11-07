import { SchemaRejected } from './errors.ts';
import { isRecord, validateJson, type JsonSchema } from './schema.ts';

export interface ChildProfile {
  summary: string;
  sensoryConsiderations: string[];
  supportStrategies: string[];
  avoid: string[];
  volunteerGuidance: string;
}

const shortText = { type: 'string', minLength: 1, maxLength: 400 } as const;

export const childProfileSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'summary',
    'sensoryConsiderations',
    'supportStrategies',
    'avoid',
    'volunteerGuidance',
  ],
  properties: {
    summary: { type: 'string', minLength: 1, maxLength: 2000 },
    sensoryConsiderations: { type: 'array', maxItems: 12, items: shortText },
    supportStrategies: { type: 'array', maxItems: 12, items: shortText },
    avoid: { type: 'array', maxItems: 12, items: shortText },
    volunteerGuidance: { type: 'string', minLength: 1, maxLength: 2000 },
  },
} satisfies JsonSchema;

export const childProfileSchemaName = 'child_profile';

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) return null;
  return value;
}

export function parseChildProfile(value: unknown): ChildProfile {
  if (!validateJson(childProfileSchema, value) || !isRecord(value)) throw new SchemaRejected();
  const sensoryConsiderations = stringArray(value.sensoryConsiderations);
  const supportStrategies = stringArray(value.supportStrategies);
  const avoid = stringArray(value.avoid);
  if (
    typeof value.summary !== 'string' ||
    typeof value.volunteerGuidance !== 'string' ||
    sensoryConsiderations === null ||
    supportStrategies === null ||
    avoid === null
  ) {
    throw new SchemaRejected();
  }
  return {
    summary: value.summary,
    sensoryConsiderations,
    supportStrategies,
    avoid,
    volunteerGuidance: value.volunteerGuidance,
  };
}
