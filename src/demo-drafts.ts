import { SchemaRejected } from './errors.ts';
import { isRecord, validateJson, type JsonSchema } from './schema.ts';
import { sundayStorySentences } from './sunday-story-text.ts';

const BRIEF_FIELDS = [
  'loves',
  'overwhelms',
  'whatHelps',
  'communication',
  'sensory',
  'toileting',
  'allergies',
  'calming',
  'medical',
] as const;

type BriefField = (typeof BRIEF_FIELDS)[number];

export interface DraftLine {
  field: BriefField;
  label: string;
  text: string;
}

export interface StoryChurch {
  readonly name: string;
  readonly service: string;
  readonly room: string;
  readonly leader: string;
  readonly plan: string;
}

export interface SocialStoryRequest {
  readonly lines: DraftLine[];
  readonly childName: string;
  readonly church: StoryChurch;
}

export type StorySource = 'model' | 'fallback';

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
  readonly title: string;
  readonly body: string;
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

const STORY_FIELDS = [
  'loves',
  'overwhelms',
  'whatHelps',
  'communication',
  'sensory',
  'toileting',
  'calming',
] as const;

const CHURCH_KEYS = ['name', 'service', 'room', 'leader', 'plan'] as const;

type StoryField = (typeof STORY_FIELDS)[number];

const SOCIAL_STORY_RULES = [
  'The data is fictional. Do not invent medical facts.',
  "Write in the third person, using the child's preferred name.",
  "When the given lines do not use he or she, use the child's name instead of he or she.",
  'Use only the church plan and the given lines.',
  'Be calm and positive.',
  'A hard moment is described gently, for example "Sometimes songs are loud."',
  'No labels or medical words.',
  'Never suggest leaving the room or the group.',
  'Use only names that appear in the input.',
  'Return JSON with title and body, and write the body as prose rather than a dict.',
  'Write it as a short story read aloud to the child, in 5 to 8 short sentences, under 90 words, in short paragraphs.',
  'The title is a story title such as "Rowan\'s Sunday at Harbor Room", never a Plan or Supporting.',
  'Describe only what the church plan says will happen. Do not promise seats, sound levels, songs, or activities beyond the plan.',
  'Do not use the words support, accommodation, ensure, engage, or upset.',
].join(' ');

const LESSON_RULES = [
  'The data is fictional. Do not invent medical facts.',
  "Adapt every step of the lesson for this child's approved needs.",
  "Use the child's preferred name.",
  'Do not say "the individual".',
  'Do not drop a lesson step.',
].join(' ');

export const DEMO_VOLUNTEER_NAME = 'Jordan Ellis';

const SUNDAY_RULES = [
  'The data is fictional. Do not invent medical facts.',
  'Write a short warm note from the volunteer to the parent, in your own words, summarizing how Sunday went.',
  'Mention wins and what helped.',
  'Invent nothing beyond the notes and the names.',
  'Do not copy the notes.',
  `Sign the note as ${DEMO_VOLUNTEER_NAME}, or leave no signature line.`,
  "Do not write a bracketed placeholder such as [Name] or [Volunteer's Name].",
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

function isStoryField(field: BriefField): field is StoryField {
  for (const storyField of STORY_FIELDS) {
    if (storyField === field) return true;
  }
  return false;
}

function parseChurch(value: unknown): StoryChurch | null {
  if (!isRecord(value) || !exactKeys(value, CHURCH_KEYS)) return null;
  if (!isBounded(value.name, 0, 200) || !isBounded(value.service, 0, 200)) return null;
  if (!isBounded(value.room, 0, 200) || !isBounded(value.leader, 0, 200)) return null;
  if (!isBounded(value.plan, 0, 2000)) return null;
  return {
    name: value.name,
    service: value.service,
    room: value.room,
    leader: value.leader,
    plan: value.plan,
  };
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
  if (!isRecord(value) || !exactKeys(value, ['lines', 'childName', 'church'])) return null;
  const lines = parseLines(value.lines, 0, BRIEF_FIELDS.length);
  const church = parseChurch(value.church);
  if (lines === null || church === null || !isBounded(value.childName, 1, 80)) return null;
  return { lines: lines.filter((line) => isStoryField(line.field)), childName: value.childName, church };
}

export function parseLessonRequest(value: unknown): LessonRequest | null {
  if (!isRecord(value) || !exactKeys(value, ['lesson', 'lines', 'childName'])) return null;
  if (!isBounded(value.lesson, 1, 4000) || !isBounded(value.childName, 1, 80)) return null;
  const lines = parseLines(value.lines, 0, BRIEF_FIELDS.length);
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
  const rows = [
    `Child: ${request.childName}`,
    `Church: ${request.church.name}`,
    `Service: ${request.church.service}`,
    `Room: ${request.church.room}`,
    `Leader: ${request.church.leader}`,
    `Plan: ${request.church.plan}`,
    ...linesForStoryModel(request.lines).map((line) => `${line.label}: ${line.text}`),
  ];
  return [
    { role: 'system', content: socialStorySystem() },
    { role: 'user', content: rows.join('\n') },
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
    {
      role: 'user',
      content: `Child: ${request.childName}\nVolunteer: ${DEMO_VOLUNTEER_NAME}\nNotes:\n${request.notes}`,
    },
  ];
}

export const STORY_LABEL_WORDS = [
  'special needs',
  'special',
  'autism',
  'autistic',
  'ADHD',
  'disorder',
  'condition',
  'diagnosis',
  'diagnosed',
  'disability',
  'disabled',
  'syndrome',
  'allergy',
  'allergies',
  'allergic',
  'peanut',
  'asthma',
  'inhaler',
  'EpiPen',
  'seizure',
  'medicine',
  'medication',
  'medical',
  'therapy',
  'therapist',
  'nonverbal',
  'meltdown',
  'tantrum',
  'behavior',
  'behaviour',
] as const;

export const STORY_TONE_WORDS = [
  'overwhelm',
  'scary',
  'scared',
  'afraid',
  'hurt',
  'wrong',
  'bad',
  "don't worry",
  'don’t worry',
  'dont worry',
  'do not worry',
] as const;

export const STORY_LEAVING_PHRASES = [
  'step outside',
  'go outside',
  'leave the room',
  'run off',
  'run away',
  'wander',
] as const;

function linesForStoryModel(lines: readonly DraftLine[]): readonly DraftLine[] {
  return lines.filter((line) => !listed(line.text, STORY_TONE_WORDS) && !listed(line.text, STORY_LEAVING_PHRASES));
}

function socialStorySystem(): string {
  const banned = [...STORY_LABEL_WORDS, ...STORY_TONE_WORDS, ...STORY_LEAVING_PHRASES].join(', ');
  return `${SOCIAL_STORY_RULES} Never use these words: ${banned}.`;
}

const STORY_STARTERS = [
  'i',
  'you',
  'on',
  'at',
  'first',
  'then',
  'next',
  'after',
  'when',
  'if',
  'sometimes',
  'there',
  'it',
  'everyone',
  'the',
  'a',
  'sunday',
  'god',
  'jesus',
] as const;

const STORY_COMMON_CAPITALS = [
  'he',
  'she',
  'they',
  'his',
  'her',
  'today',
  'inside',
  'soon',
  'later',
  'afterward',
  'finally',
  'now',
  'here',
  'this',
  'that',
  'everything',
  'music',
  'church',
] as const;

const NAME_ABBREVIATIONS = new Set(['mr', 'mrs', 'ms', 'dr', 'st', 'jr', 'sr']);

const DEMO_CHILD_NAMES = ['Rowan', 'Maya', 'Jonah', 'Quinn'] as const;

const MALE_PRONOUNS = ['he', 'him', 'his', 'himself'] as const;

const FEMALE_PRONOUNS = ['she', 'her', 'hers', 'herself'] as const;

const STORY_VOICE_WORDS = ['support', 'supports', 'accommodation', 'ensure', 'engage', 'upset'] as const;

const STORY_VOICE_TITLE_WORDS = ['plan', 'supporting'] as const;

export function storySafety(
  story: { readonly title: string; readonly body: string },
  input: {
    readonly childName: string;
    readonly church: StoryChurch;
    readonly lines: readonly { readonly text: string }[];
  },
): boolean {
  const text = `${story.title}\n${story.body}`;
  if (listed(text, STORY_LABEL_WORDS) || listed(text, STORY_TONE_WORDS) || listed(text, STORY_LEAVING_PHRASES)) {
    return false;
  }
  if (usesAny(story.title, STORY_VOICE_TITLE_WORDS) || usesAny(text, STORY_VOICE_WORDS)) return false;
  if (sentenceCount(story.body) > 8 || wordCount(story.body) > 90) return false;
  if (!properNounsAllowed(story.title, story.body, input)) return false;
  if (!preferredNameAppears(text, input.childName)) return false;
  if (otherChildNamed(text, input.childName)) return false;
  return pronounsAllowed(text, input.lines);
}

function listed(text: string, words: readonly string[]): boolean {
  for (const word of words) {
    if (word === 'overwhelm') {
      if (hasPrefix(text, word)) return true;
      continue;
    }
    if (hasInflected(text, word)) return true;
  }
  return false;
}

function hasTerm(text: string, term: string): boolean {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(term)}(?![\\p{L}\\p{N}])`, 'iu').test(text);
}

function hasInflected(text: string, term: string): boolean {
  const parts = term.split(/\s+/u).map(inflectedWord);
  return new RegExp(`(?<![\\p{L}\\p{N}])${parts.join('\\s+')}(?![\\p{L}\\p{N}])`, 'iu').test(text);
}

function inflectedWord(word: string): string {
  const stem = escapeRegExp(word);
  const forms = [`${stem}(?:s|es|ed|ing)?`];
  if (word.endsWith('e') && word.length > 1) forms.push(`${escapeRegExp(word.slice(0, -1))}ing`);
  if (word.endsWith('y') && word.length > 2 && !'aeiou'.includes(word.charAt(word.length - 2).toLowerCase())) {
    forms.push(`${escapeRegExp(word.slice(0, -1))}ies`);
  }
  return `(?:${forms.join('|')})`;
}

function preferredNameAppears(text: string, childName: string): boolean {
  const parts = childName.trim().split(/\s+/u).filter((part) => part.length > 0);
  if (parts.length === 0) return false;
  const body = parts.map(escapeRegExp).join('\\s+');
  return new RegExp(`(?<![\\p{L}\\p{N}])${body}(?:['’]s)?(?![\\p{L}\\p{N}])`, 'iu').test(text);
}

function hasPrefix(text: string, prefix: string): boolean {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(prefix)}`, 'iu').test(text);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function properNounsAllowed(
  title: string,
  body: string,
  input: {
    readonly childName: string;
    readonly church: StoryChurch;
    readonly lines: readonly { readonly text: string }[];
  },
): boolean {
  const allowed = new Set<string>([...STORY_STARTERS, ...STORY_COMMON_CAPITALS]);
  const sources = [
    input.childName,
    input.church.name,
    input.church.service,
    input.church.room,
    input.church.leader,
    input.church.plan,
  ];
  for (const line of input.lines) sources.push(line.text);
  for (const source of sources) {
    for (const word of source.match(/\p{L}[\p{L}\p{N}]*/gu) ?? []) allowed.add(word.toLowerCase());
  }
  const text = `${title}\n${body}`;
  for (const match of text.matchAll(/\p{Lu}[\p{L}\p{N}]*/gu)) {
    const index = match.index ?? 0;
    if (index < title.length || isSentenceStart(text, index)) continue;
    const token = match[0];
    if (token === undefined || !allowed.has(token.toLowerCase())) return false;
  }
  return true;
}

const SENTENCE_SKIP = new Set([' ', '\t', '\r', '"', "'", '\u201C', '\u201D', '\u2018', '\u2019', '(', ')']);

function isSentenceStart(text: string, index: number): boolean {
  let cursor = index - 1;
  while (cursor >= 0 && SENTENCE_SKIP.has(text[cursor] ?? '')) cursor -= 1;
  if (cursor < 0) return true;
  const previous = text[cursor];
  if (previous === '\n' || previous === '!' || previous === '?') return true;
  if (previous !== '.') return false;
  if (text[cursor - 1] === '.') return false;
  return !abbreviationBefore(text, cursor);
}

function abbreviationBefore(text: string, periodIndex: number): boolean {
  let start = periodIndex - 1;
  while (start >= 0 && /\p{L}/u.test(text[start] ?? '')) start -= 1;
  const word = text.slice(start + 1, periodIndex);
  if (word.length === 1) return true;
  if (!NAME_ABBREVIATIONS.has(word.toLowerCase())) return false;
  const before = text[start];
  return before === undefined || !/[\p{L}\p{N}]/u.test(before);
}

function ellipsisDot(text: string, index: number): boolean {
  if (text[index] !== '.') return false;
  let before = index - 1;
  while (before >= 0 && text[before] === ' ') before -= 1;
  if (text[before] === '.') return true;
  let after = index + 1;
  while (after < text.length && text[after] === ' ') after += 1;
  return text[after] === '.';
}

function sentenceCount(body: string): number {
  const text = body.trim();
  let count = 0;
  let lastEnd = -1;
  for (let index = 0; index < text.length; index += 1) {
    const mark = text[index];
    if (mark !== '.' && mark !== '!' && mark !== '?') continue;
    if (mark === '.' && ellipsisDot(text, index)) continue;
    const next = text[index + 1];
    if (next === '.' || next === '!' || next === '?') continue;
    if (mark === '.' && abbreviationBefore(text, index)) continue;
    if (mark === '.' && /\p{N}/u.test(text[index - 1] ?? '') && /\p{N}/u.test(next ?? '')) continue;
    count += 1;
    lastEnd = index;
  }
  if (lastEnd < 0) return hasLetterOrNumber(text) ? 1 : 0;
  if (hasLetterOrNumber(text.slice(lastEnd + 1))) count += 1;
  return count;
}

function wordCount(body: string): number {
  let count = 0;
  for (const token of body.split(/\s+/u)) {
    if (hasLetterOrNumber(token)) count += 1;
  }
  return count;
}

function hasLetterOrNumber(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(text);
}

function otherChildNamed(text: string, childName: string): boolean {
  const current = childName.toLowerCase();
  for (const name of DEMO_CHILD_NAMES) {
    if (name.toLowerCase() === current) continue;
    if (hasTerm(text, name)) return true;
  }
  return false;
}

function pronounsAllowed(text: string, lines: readonly { readonly text: string }[]): boolean {
  const lineText = lines.map((line) => line.text).join('\n');
  if (usesAny(text, MALE_PRONOUNS) && !usesAny(lineText, MALE_PRONOUNS)) return false;
  if (usesAny(text, FEMALE_PRONOUNS) && !usesAny(lineText, FEMALE_PRONOUNS)) return false;
  return true;
}

function usesAny(text: string, words: readonly string[]): boolean {
  return words.some((word) => hasTerm(text, word));
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

const BRACKET_PLACEHOLDER = /\[[A-Za-z][A-Za-z'’/\- ]{0,79}\]/g;

export function stripBracketPlaceholders(body: string): string {
  return body
    .replace(BRACKET_PLACEHOLDER, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\s+([.,;:!?])/g, '$1')
    .replace(/,([.!?])/g, '$1')
    .replace(/,\s*,/g, ',')
    .replace(/\n\s*[—–-]\s*(?=\n|$)/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function updateBodyAccepted(body: string, notes: string, childName: string): boolean {
  if (body.length === 0 || body === notes) return false;
  return collapseSpace(withoutChildName(body, childName)) !== collapseSpace(notes);
}

function stringList(value: unknown): string[] | null {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) return null;
  return value;
}

export function parseSocialStory(
  value: unknown,
  input: {
    readonly childName: string;
    readonly church: StoryChurch;
    readonly lines: readonly { readonly text: string }[];
  },
): SocialStoryDraft {
  if (!validateJson(socialStorySchema, value) || !isRecord(value)) throw new SchemaRejected();
  if (typeof value.title !== 'string' || typeof value.body !== 'string') throw new SchemaRejected();
  if (!storyBodyAccepted(value.body)) throw new SchemaRejected();
  if (!storySafety({ title: value.title, body: value.body }, input)) throw new SchemaRejected();
  return { title: value.title, body: value.body };
}

export function fallbackSocialStory(request: SocialStoryRequest): {
  readonly title: string;
  readonly body: string;
  readonly source: 'fallback';
} {
  return {
    title: `Sunday with ${request.childName}`.slice(0, 120),
    body: sundayStorySentences(request.church).join('\n\n'),
    source: 'fallback',
  };
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
  const body = stripBracketPlaceholders(value.body);
  if (!updateBodyAccepted(body, notes, childName)) throw new SchemaRejected();
  return { body };
}
