import { SchemaRejected } from './errors.ts';
import { isRecord, validateJson, type JsonSchema } from './schema.ts';

const BRIEF_FIELDS = ['loves', 'overwhelms', 'whatHelps', 'communication', 'sensory', 'medical'] as const;

type BriefField = (typeof BRIEF_FIELDS)[number];

export interface DraftLine {
  field: BriefField;
  label: string;
  text: string;
}

export interface SocialStoryRequest {
  lines: DraftLine[];
}

export interface LessonRequest {
  lesson: string;
  lines: DraftLine[];
}

export interface SundayUpdateRequest {
  notes: string;
  childName: string;
}

export interface SocialStoryDraft {
  title: string;
  body: string;
}

export interface LessonDraft {
  summary: string;
  steps: string[];
}

export interface SundayUpdateDraft {
  body: string;
}

export interface DraftMessage {
  role: 'system' | 'user';
  content: string;
}

const LINE_KEYS = ['field', 'label', 'text'] as const;

const LINE_RULES =
  'The data is fictional. Do not invent medical facts. Use only the supplied lines. Return JSON only, matching the schema.';

const LESSON_RULES =
  'The data is fictional. Do not invent medical facts. Use only the supplied lesson and lines. Return JSON only, matching the schema.';

const SUNDAY_RULES =
  'The data is fictional. Do not invent medical facts. Use only the supplied notes and the child name. Return JSON only, matching the schema.';

function boundedText(max: number): JsonSchema {
  return { type: 'string', minLength: 1, maxLength: max };
}

export const socialStorySchemaName = 'social_story';

export const socialStorySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'body'],
  properties: {
    title: boundedText(120),
    body: boundedText(2000),
  },
} satisfies JsonSchema;

export const lessonSchemaName = 'lesson_adaptation';

export const lessonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'steps'],
  properties: {
    summary: boundedText(600),
    steps: {
      type: 'array',
      minItems: 1,
      maxItems: 8,
      items: boundedText(400),
    },
  },
} satisfies JsonSchema;

export const sundayUpdateSchemaName = 'sunday_update';

export const sundayUpdateSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['body'],
  properties: {
    body: boundedText(2000),
  },
} satisfies JsonSchema;

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function isBounded(value: unknown, min: number, max: number): value is string {
  return typeof value === 'string' && value.length >= min && value.length <= max;
}

function isBriefField(value: unknown): value is BriefField {
  if (typeof value !== 'string') return false;
  for (const field of BRIEF_FIELDS) {
    if (field === value) return true;
  }
  return false;
}

function parseLine(value: unknown): DraftLine | null {
  if (!isRecord(value) || !exactKeys(value, LINE_KEYS)) return null;
  if (!isBriefField(value.field) || !isBounded(value.label, 1, 120) || !isBounded(value.text, 1, 2000)) {
    return null;
  }
  return { field: value.field, label: value.label, text: value.text };
}

function parseLines(value: unknown, min: number, max: number): DraftLine[] | null {
  if (!Array.isArray(value) || value.length < min || value.length > max) return null;
  const lines: DraftLine[] = [];
  for (const item of value) {
    const line = parseLine(item);
    if (line === null) return null;
    lines.push(line);
  }
  return lines;
}

export function parseSocialStoryRequest(value: unknown): SocialStoryRequest | null {
  if (!isRecord(value) || !exactKeys(value, ['lines'])) return null;
  const lines = parseLines(value.lines, 1, 6);
  if (lines === null) return null;
  return { lines };
}

export function parseLessonRequest(value: unknown): LessonRequest | null {
  if (!isRecord(value) || !exactKeys(value, ['lesson', 'lines'])) return null;
  if (!isBounded(value.lesson, 1, 4000)) return null;
  const lines = parseLines(value.lines, 0, 6);
  if (lines === null) return null;
  return { lesson: value.lesson, lines };
}

export function parseSundayUpdateRequest(value: unknown): SundayUpdateRequest | null {
  if (!isRecord(value) || !exactKeys(value, ['notes', 'childName'])) return null;
  if (!isBounded(value.notes, 0, 4000) || !isBounded(value.childName, 1, 80)) return null;
  return { notes: value.notes, childName: value.childName };
}

export function socialStoryMessages(request: SocialStoryRequest): DraftMessage[] {
  return [
    { role: 'system', content: LINE_RULES },
    { role: 'user', content: JSON.stringify(request) },
  ];
}

export function lessonMessages(request: LessonRequest): DraftMessage[] {
  return [
    { role: 'system', content: LESSON_RULES },
    { role: 'user', content: JSON.stringify(request) },
  ];
}

export function sundayUpdateMessages(request: SundayUpdateRequest): DraftMessage[] {
  return [
    { role: 'system', content: SUNDAY_RULES },
    { role: 'user', content: JSON.stringify(request) },
  ];
}

function stringList(value: unknown): string[] | null {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) return null;
  return value;
}

export function parseSocialStory(value: unknown): SocialStoryDraft {
  if (!validateJson(socialStorySchema, value) || !isRecord(value)) throw new SchemaRejected();
  if (typeof value.title !== 'string' || typeof value.body !== 'string') throw new SchemaRejected();
  return { title: value.title, body: value.body };
}

export function parseLesson(value: unknown): LessonDraft {
  if (!validateJson(lessonSchema, value) || !isRecord(value)) throw new SchemaRejected();
  const steps = stringList(value.steps);
  if (typeof value.summary !== 'string' || steps === null) throw new SchemaRejected();
  return { summary: value.summary, steps };
}

export function parseSundayUpdate(value: unknown): SundayUpdateDraft {
  if (!validateJson(sundayUpdateSchema, value) || !isRecord(value)) throw new SchemaRejected();
  if (typeof value.body !== 'string') throw new SchemaRejected();
  return { body: value.body };
}
