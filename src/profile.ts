import { SchemaRejected } from './errors.ts';
import { isRecord, validateJson, type JsonSchema } from './schema.ts';
import { stripLeadingPreamble } from './what-helps.ts';

export interface ChildProfile {
  summary: string;
  sensoryConsiderations: string[];
  supportStrategies: string[];
  avoid: string[];
  volunteerGuidance: string;
  whatHelps: string[];
}

const shortText = { type: 'string', minLength: 1, maxLength: 400 } as const;
const helpText = { type: 'string', minLength: 1, maxLength: 110 } as const;

export const childProfileSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'summary',
    'sensoryConsiderations',
    'supportStrategies',
    'avoid',
    'volunteerGuidance',
    'whatHelps',
  ],
  properties: {
    summary: { type: 'string', minLength: 1, maxLength: 2000 },
    sensoryConsiderations: { type: 'array', maxItems: 12, items: shortText },
    supportStrategies: { type: 'array', maxItems: 12, items: shortText },
    avoid: { type: 'array', maxItems: 12, items: shortText },
    volunteerGuidance: { type: 'string', minLength: 1, maxLength: 2000 },
    whatHelps: { type: 'array', minItems: 3, maxItems: 5, items: helpText },
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
  const whatHelps = stringArray(value.whatHelps);
  if (
    typeof value.summary !== 'string' ||
    typeof value.volunteerGuidance !== 'string' ||
    sensoryConsiderations === null ||
    supportStrategies === null ||
    avoid === null ||
    whatHelps === null
  ) {
    throw new SchemaRejected();
  }
  const summary = stripLeadingPreamble(value.summary);
  const stripped = whatHelps.map((bullet) => stripLeadingPreamble(bullet));
  const helps = stripped.filter((text) => text.length > 0);
  const summaryWasPreamble = value.summary.trim().length > 0 && summary.length === 0;
  const droppedPreambleBullet = stripped.some((text, index) => text.length === 0 && whatHelps[index]?.trim() !== '');
  const minHelps = childProfileSchema.properties.whatHelps.minItems;
  if (summaryWasPreamble || (droppedPreambleBullet && helps.length < minHelps)) {
    throw new SchemaRejected('preamble_only');
  }
  return {
    summary,
    sensoryConsiderations,
    supportStrategies,
    avoid,
    volunteerGuidance: value.volunteerGuidance,
    whatHelps: helps,
  };
}
