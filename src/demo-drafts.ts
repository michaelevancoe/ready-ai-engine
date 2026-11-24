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
  childName: string;
}

export interface LessonRequest {
  lesson: string;
  lines: DraftLine[];
  childName: string;
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

const SOCIAL_STORY_RULES = [
  'The data is fictional. Do not invent medical facts.',
  'Write a short warm story a child could hear before church, in the first person or the second person.',
  'Use a few short sentences about arriving, the room, what might happen, and what helps.',
  "Use only the approved lines and the child's preferred name.",
  'Return JSON with title and body, and write the body as prose rather than a dict.',
].join(' ');

const LESSON_RULES = [
  'The data is fictional. Do not invent medical facts.',
  "Adapt every step of the lesson for this child's approved needs.",
  "Use the child's preferred name.",
  'Do not say "the individual".',
  'Do not drop a lesson step.',
].join(' ');

const SUNDAY_RULES = [
  'The data is fictional. Do not invent medical facts.',
  'Write a short warm note from the volunteer to the parent, in your own words, summarizing how Sunday went.',
  'Mention wins and what helped.',
  'Invent nothing beyond the notes and the name.',
  'Do not copy the notes.',
].join(' ');

const LABEL_WORDS = new Set([
  'loves',
  'overwhelms',
  'what',
  'helps',
  'communication',
  'sensory',
  'needs',
  'medical',
  'health',
  'notes',
]);

const QUOTED_FIELD = new RegExp(`['"](?:${BRIEF_FIELDS.join('|')})['"]\\s*:`);

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
  if (!isRecord(value) || !exactKeys(value, ['lines', 'childName'])) return null;
  const lines = parseLines(value.lines, 1, 6);
  if (lines === null || !isBounded(value.childName, 1, 80)) return null;
  return { lines, childName: value.childName };
}

export function parseLessonRequest(value: unknown): LessonRequest | null {
  if (!isRecord(value) || !exactKeys(value, ['lesson', 'lines', 'childName'])) return null;
  if (!isBounded(value.lesson, 1, 4000) || !isBounded(value.childName, 1, 80)) return null;
  const lines = parseLines(value.lines, 0, 6);
  if (lines === null) return null;
  return { lesson: value.lesson, lines, childName: value.childName };
}

export function parseSundayUpdateRequest(value: unknown): SundayUpdateRequest | null {
  if (!isRecord(value) || !exactKeys(value, ['notes', 'childName'])) return null;
  if (!isBounded(value.notes, 0, 4000) || !isBounded(value.childName, 1, 80)) return null;
  return { notes: value.notes, childName: value.childName };
}

function labeledLines(lines: readonly DraftLine[]): string {
  return lines.map((line) => `${line.label}: ${line.text}`).join('\n');
}

export function socialStoryMessages(request: SocialStoryRequest): DraftMessage[] {
  return [
    { role: 'system', content: SOCIAL_STORY_RULES },
    { role: 'user', content: `Child: ${request.childName}\n${labeledLines(request.lines)}` },
  ];
}

export function lessonMessages(request: LessonRequest): DraftMessage[] {
  return [
    { role: 'system', content: LESSON_RULES },
    {
      role: 'user',
      content: `Child: ${request.childName}\nLesson:\n${request.lesson}\nApproved needs:\n${labeledLines(request.lines)}`,
    },
  ];
}

export function sundayUpdateMessages(request: SundayUpdateRequest): DraftMessage[] {
  return [
    { role: 'system', content: SUNDAY_RULES },
    { role: 'user', content: `Child: ${request.childName}\nNotes:\n${request.notes}` },
  ];
}

export function storyBodyAccepted(body: string): boolean {
  const trimmed = body.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return false;
  if (QUOTED_FIELD.test(trimmed)) return false;
  const words = trimmed
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);
  if (words.length === 0) return false;
  return words.some((word) => !LABEL_WORDS.has(word.toLowerCase()));
}

function collapseSpace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function withoutChildName(body: string, childName: string): string {
  return body.split(childName).join('');
}

export function updateBodyAccepted(body: string, notes: string, childName: string): boolean {
  if (body === notes) return false;
  return collapseSpace(withoutChildName(body, childName)) !== collapseSpace(notes);
}

function stringList(value: unknown): string[] | null {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) return null;
  return value;
}

export function parseSocialStory(value: unknown): SocialStoryDraft {
  if (!validateJson(socialStorySchema, value) || !isRecord(value)) throw new SchemaRejected();
  if (typeof value.title !== 'string' || typeof value.body !== 'string') throw new SchemaRejected();
  if (!storyBodyAccepted(value.body)) throw new SchemaRejected();
  return { title: value.title, body: value.body };
}

export function parseLesson(value: unknown): LessonDraft {
  if (!validateJson(lessonSchema, value) || !isRecord(value)) throw new SchemaRejected();
  const steps = stringList(value.steps);
  if (typeof value.summary !== 'string' || steps === null) throw new SchemaRejected();
  return { summary: value.summary, steps };
}

export function parseSundayUpdate(value: unknown, notes: string, childName: string): SundayUpdateDraft {
  if (!validateJson(sundayUpdateSchema, value) || !isRecord(value)) throw new SchemaRejected();
  if (typeof value.body !== 'string') throw new SchemaRejected();
  if (!updateBodyAccepted(value.body, notes, childName)) throw new SchemaRejected();
  return { body: value.body };
}
