import { SchemaRejected, type FallbackReason } from './errors.ts';
import { isRecord, validateJson, type JsonSchema } from './schema.ts';
import {
  STORY_BEATS,
  SUNDAY_STORY_PAGE_MAX,
  sundayStorySentences,
  templateStoryPages,
  type StoryBeat,
  type StoryPages,
} from './sunday-story-text.ts';

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

export interface SundayUpdateRequest {
  notes: string;
  childName: string;
  leader: string;
  church: string;
}

export interface SocialStoryDraft {
  readonly title: string;
  readonly pages: StoryPages;
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
  'A hard moment is described gently, in words of your own.',
  'No labels or medical words.',
  'Never suggest leaving the room or the group.',
  'Use only names that appear in the input.',
  'Return JSON with title and pages, and write each page as prose rather than a dict.',
  'pages has arrive, doors, desk, room, helper, quiet, and pickup.',
  'Each page is one or two sentences and about 15 to 30 words, even when the answers are short.',
  'The room page can mention the Sunday schedule. Do not list times or invent schedule items.',
  'Fill each page with the church name, service, room, leader, and plan, and with details from the given lines.',
  'Do not invent people or places.',
  'Write every page in the third person. Do not use you or your.',
  'Stay in the third person on every page, including pickup.',
  'Do not copy a stock page.',
  'Do not promise or predict a feeling. Do not write that anyone will be happy, will be excited, will love, or will enjoy. Use can or may.',
  'Do not hedge a church detail with likely.',
  'At least 3 pages use a detail from Loves, What helps, Communication, or Sensory.',
  'One page is a gentle hard moment and never uses the banned tone words.',
  'Parent-named objects are allowed with can or may, and nothing is promised about the church.',
  'The title is a varied story title for this child and this morning, never a Plan or Supporting title.',
  'Use ordinary spoken English, and put the before a room name.',
  'Describe only what the church plan says will happen. Do not add a seat, a kind of seat, a sound level, a song, or an activity the plan does not name. Do not promise that anything will be ready.',
  'The pickup page ends with one warm, calm, reassuring line for the child. It welcomes them and does not promise anything. Do not add a line or a field after the JSON.',
  'Do not use the words support, accommodation, ensure, engage, or upset.',
].join(' ');

const SUNDAY_RULES = [
  'The data is fictional. Do not invent medical facts.',
  "Write a short warm note from the children's ministry leader to the parent, in your own words, summarizing how Sunday went.",
  'Mention wins and what helped.',
  'Invent nothing beyond the notes and the names.',
  'Do not copy the notes.',
  'Do not add a sign-off. Ready adds the leader and the church.',
  'Do not open with the leader at the church, such as "Jordan at Harbor Church:".',
  "Do not write a bracketed placeholder such as [Name] or [Volunteer's Name].",
].join(' ');

const SUNDAY_KEYS = ['notes', 'childName', 'leader', 'church'] as const;

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

const storyPageText = { type: 'string', minLength: 0, maxLength: SUNDAY_STORY_PAGE_MAX } as const;

export const socialStorySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'pages'],
  properties: {
    title: boundedText(120),
    pages: {
      type: 'object',
      additionalProperties: false,
      required: [...STORY_BEATS],
      properties: storyPageProperties(),
    },
  },
} satisfies JsonSchema;

function storyPageProperties(): { [beat in StoryBeat]: typeof storyPageText } {
  return {
    arrive: storyPageText,
    doors: storyPageText,
    desk: storyPageText,
    room: storyPageText,
    helper: storyPageText,
    quiet: storyPageText,
    pickup: storyPageText,
  };
}

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

export function parseSundayUpdateRequest(value: unknown): SundayUpdateRequest | null {
  if (!isRecord(value) || !exactKeys(value, SUNDAY_KEYS)) return null;
  if (!isBounded(value.notes, 0, 4000) || !isBounded(value.childName, 1, 80)) return null;
  if (!isBounded(value.leader, 0, 200) || !isBounded(value.church, 0, 200)) return null;
  return {
    notes: value.notes,
    childName: value.childName,
    leader: value.leader,
    church: value.church,
  };
}

export function socialStoryMessages(request: SocialStoryRequest, rejection?: FallbackReason): DraftMessage[] {
  const rows = [
    `Child: ${request.childName}`,
    `Church: ${request.church.name}`,
    `Service: ${request.church.service}`,
    `Room: ${request.church.room}`,
    `Leader: ${request.church.leader}`,
    `Plan: ${request.church.plan}`,
    ...linesForStoryModel(request.lines).map((line) => `${line.label}: ${line.text}`),
  ];
  const hint = storyRetryHint(rejection);
  const system = hint.length === 0 ? socialStorySystem() : `${socialStorySystem()} ${hint}`;
  return [
    { role: 'system', content: system },
    { role: 'user', content: rows.join('\n') },
  ];
}

export function sundayUpdateMessages(request: SundayUpdateRequest): DraftMessage[] {
  return [
    { role: 'system', content: SUNDAY_RULES },
    {
      role: 'user',
      content: `Child: ${request.childName}\nLeader: ${request.leader}\nChurch: ${request.church}\nVolunteer notes:\n${request.notes}`,
    },
  ];
}

const ALLERGY_WORDS = ['allergy', 'allergies', 'allergic', 'peanut', 'asthma', 'inhaler', 'EpiPen'] as const;

const MEDICAL_WORDS = [
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
  'seizure',
  'medicine',
  'medication',
  'medical',
  'therapy',
  'therapist',
  'nonverbal',
  'meltdown',
  'tantrum',
] as const;

export const STORY_LABEL_WORDS = [
  'special needs',
  'behavior',
  'behaviour',
  ...ALLERGY_WORDS,
  ...MEDICAL_WORDS,
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

const HARD_MOMENT_LABEL = 'Hard moment (describe gently, never name the word)';

function linesForStoryModel(lines: readonly DraftLine[]): readonly DraftLine[] {
  const kept: DraftLine[] = [];
  for (const line of lines) {
    if (line.field === 'overwhelms') {
      kept.push({ ...line, label: HARD_MOMENT_LABEL });
      continue;
    }
    if (listed(line.text, STORY_TONE_WORDS) || listed(line.text, STORY_LEAVING_PHRASES)) continue;
    kept.push(line);
  }
  return kept;
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
  return storyRejectReason(story, input) === null;
}

function storyRejectReason(
  story: { readonly title: string; readonly body: string },
  input: {
    readonly childName: string;
    readonly church: StoryChurch;
    readonly lines: readonly { readonly text: string }[];
  },
): FallbackReason | null {
  const text = `${story.title}\n${story.body}`;
  if (listed(text, ALLERGY_WORDS)) return 'safety_allergy';
  if (listed(text, MEDICAL_WORDS)) return 'safety_medical';
  if (listed(text, STORY_LABEL_WORDS) || listed(text, STORY_TONE_WORDS) || listed(text, STORY_LEAVING_PHRASES)) {
    return 'safety_banned_word';
  }
  if (usesAny(story.title, STORY_VOICE_TITLE_WORDS) || usesAny(text, STORY_VOICE_WORDS)) return 'safety_banned_word';
  if (!properNounsAllowed(story.title, story.body, input)) return 'safety_unknown_name';
  if (!preferredNameAppears(text, input.childName)) return 'safety_unknown_name';
  if (otherChildNamed(text, input.childName)) return 'safety_unknown_name';
  if (!pronounsAllowed(text, input.lines)) return 'safety_pronoun';
  return null;
}

function storyRetryHint(rejection: FallbackReason | undefined): string {
  switch (rejection) {
    case undefined:
      return '';
    case 'safety_unknown_name':
      return 'Rejected: safety_unknown_name. Use only names from the input, and do not capitalize an ordinary word as a new name.';
    case 'safety_allergy':
      return 'Rejected: safety_allergy. Do not mention an allergy, a peanut, asthma, or an inhaler.';
    case 'safety_medical':
      return 'Rejected: safety_medical. Do not mention a condition, diagnosis, medicine, or therapy.';
    case 'safety_banned_word':
      return 'Rejected: safety_banned_word. Remove labels, tone words, and words about leaving.';
    case 'safety_pronoun':
      return 'Rejected: safety_pronoun. Do not use he, she, or they unless the input uses them. Use the child name.';
    case 'child_detail_min':
      return 'Rejected: child_detail_min. Use at least two concrete words from the loves, helps, communication, or sensory lines.';
    case 'invalid_json':
    case 'truncated':
    case 'schema':
    case 'preamble_only':
    case 'too_short':
    case 'church_detail':
    case 'safety':
    case 'safety_script':
    case 'upstream_error':
    case 'line_rejected':
    case 'line_rejected_words':
    case 'line_rejected_length':
    case 'line_rejected_shape':
    case 'line_rejected_restatement':
    case 'line_rejected_repeat':
      return '';
    default: {
      const leftover: never = rejection;
      return leftover;
    }
  }
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
  const suffix = word === 'condition' ? '(?:s|es)?' : '(?:s|es|ed|ing)?';
  const forms = [`${stem}${suffix}`];
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
  for (const source of sources) addNameWords(allowed, source);
  for (const sentence of sundayStorySentences(input.church)) addNameWords(allowed, sentence);
  const text = `${title}\n${body}`;
  for (const match of text.matchAll(/\p{Lu}[\p{L}\p{N}]*/gu)) {
    const index = match.index ?? 0;
    if (index < title.length || isSentenceStart(text, index)) continue;
    const token = match[0];
    if (token === undefined || !nameAllowed(token, allowed)) return false;
  }
  return true;
}

function addNameWords(allowed: Set<string>, source: string): void {
  for (const word of source.match(/\p{L}[\p{L}\p{N}]*/gu) ?? []) allowed.add(word.toLowerCase());
}

function nameAllowed(token: string, allowed: Set<string>): boolean {
  const word = token.toLowerCase();
  if (allowed.has(word)) return true;
  if (word.length >= 4 && word.endsWith('s') && allowed.has(word.slice(0, -1))) return true;
  if (word.length >= 4 && allowed.has(`${word}s`)) return true;
  if (word.length >= 4 && word.endsWith('ies') && allowed.has(`${word.slice(0, -3)}y`)) return true;
  if (word.length >= 4 && word.endsWith('y') && allowed.has(`${word.slice(0, -1)}ies`)) return true;
  return false;
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

const NOUN_FIELDS: ReadonlySet<string> = new Set(['loves', 'overwhelms', 'whatHelps', 'communication', 'sensory']);

const STORY_STOPWORDS = new Set([
  'about',
  'above',
  'after',
  'again',
  'against',
  'also',
  'among',
  'another',
  'around',
  'because',
  'been',
  'before',
  'being',
  'below',
  'between',
  'both',
  'could',
  'does',
  'doing',
  'down',
  'during',
  'each',
  'else',
  'enough',
  'ever',
  'every',
  'everyone',
  'everything',
  'from',
  'further',
  'have',
  'having',
  'here',
  'hers',
  'herself',
  'himself',
  'into',
  'itself',
  'just',
  'more',
  'most',
  'much',
  'must',
  'myself',
  'once',
  'only',
  'onto',
  'other',
  'ours',
  'ourselves',
  'over',
  'same',
  'should',
  'some',
  'such',
  'than',
  'that',
  'their',
  'theirs',
  'them',
  'themselves',
  'then',
  'there',
  'these',
  'they',
  'this',
  'those',
  'through',
  'under',
  'until',
  'very',
  'were',
  'what',
  'when',
  'where',
  'which',
  'while',
  'whom',
  'will',
  'with',
  'would',
  'your',
  'yours',
  'yourself',
  'yourselves',
]);

const INVENTED_CHURCH_WORDS = ['seat', 'song', 'activity'] as const;

const CHURCH_HEDGES = ['can', 'may', 'could', 'might'] as const;

const SHORT_FUNCTION = new Set([
  'all',
  'and',
  'any',
  'are',
  'but',
  'can',
  'did',
  'for',
  'get',
  'got',
  'had',
  'has',
  'her',
  'him',
  'his',
  'how',
  'its',
  'let',
  'may',
  'new',
  'not',
  'now',
  'off',
  'old',
  'one',
  'our',
  'out',
  'own',
  'put',
  'say',
  'she',
  'the',
  'too',
  'use',
  'was',
  'way',
  'who',
  'you',
]);

const MIN_PAGE_WORDS = 6;
const MIN_STORY_WORDS = 56;

export function parseSocialStory(
  value: unknown,
  input: {
    readonly childName: string;
    readonly church: StoryChurch;
    readonly lines: readonly { readonly text: string; readonly field?: string }[];
  },
): SocialStoryDraft {
  if (!isRecord(value) || typeof value.title !== 'string' || !isRecord(value.pages)) {
    throw new SchemaRejected('schema');
  }
  if (value.title.length < 1 || value.title.length > 120) throw new SchemaRejected('schema');
  const templates = templateStoryPages(input.church);
  const pages = {} as { [beat in StoryBeat]: string };
  for (const beat of STORY_BEATS) {
    const raw = value.pages[beat];
    if (typeof raw !== 'string') throw new SchemaRejected('truncated');
    pages[beat] = keptPage(raw, templates[beat]);
  }
  const body = STORY_BEATS.map((beat) => pages[beat]).join('\n');
  if (!storyBodyAccepted(body)) throw new SchemaRejected('schema');
  const safety = storyRejectReason({ title: value.title, body }, input);
  if (safety !== null) throw new SchemaRejected(safety);
  if (sentenceCount(body) < 5 || wordCount(body) < MIN_STORY_WORDS) throw new SchemaRejected('too_short');
  if (childNouns(body, input).size < 2) throw new SchemaRejected('child_detail_min');
  if (inventedChurchDetail(body, input)) throw new SchemaRejected('church_detail');
  return { title: value.title, pages };
}

const SECOND_PERSON = /\byou(?:r(?:self|s)?)?\b/iu;
const PROMISED_FEELING =
  /\bwill\s+be\s+(?:happy|excited|glad|pleased|thrilled)\b|\bwill\s+(?:love|enjoy)\b/iu;

function keptPage(raw: string, template: string): string {
  if (unfinishedProse(raw)) throw new SchemaRejected('truncated');
  if (raw.length > SUNDAY_STORY_PAGE_MAX) throw new SchemaRejected('schema');
  const sentences = sentencesIn(raw);
  const candidate =
    sentences.length > 2 ? sentences.slice(0, 2).map((sentence) => sentence.trim()).join(' ') : raw.trim();
  if (!beatKept(candidate)) throw new SchemaRejected('schema');
  if (!pageEnds(candidate)) throw new SchemaRejected('truncated');
  if (collapseSpace(candidate) === collapseSpace(template)) throw new SchemaRejected('schema');
  if (SECOND_PERSON.test(candidate) || PROMISED_FEELING.test(candidate)) throw new SchemaRejected('safety');
  if (wordCount(candidate) < MIN_PAGE_WORDS) throw new SchemaRejected('too_short');
  return candidate;
}

function unfinishedProse(text: string): boolean {
  const trimmed = text.trim();
  return hasLetterOrNumber(trimmed) && !pageEnds(trimmed) && storyBodyAccepted(trimmed);
}

function pageEnds(text: string): boolean {
  return /[.!?]["'”’]*$/u.test(text.trim());
}

export function fallbackSocialStory(request: SocialStoryRequest): {
  readonly title: string;
  readonly pages: StoryPages;
  readonly source: 'fallback';
} {
  return {
    title: `Sunday with ${request.childName}`.slice(0, 120),
    pages: templateStoryPages(request.church),
    source: 'fallback',
  };
}

export function storyTokenAllowed(word: string): boolean {
  if (listed(word, STORY_LABEL_WORDS) || listed(word, STORY_TONE_WORDS) || listed(word, STORY_LEAVING_PHRASES)) {
    return false;
  }
  return !usesAny(word, STORY_VOICE_WORDS);
}

function beatKept(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0 || !storyBodyAccepted(trimmed)) return false;
  const sentences = sentenceCount(trimmed);
  if (sentences < 1 || sentences > 2) return false;
  if (listed(trimmed, STORY_LABEL_WORDS) || listed(trimmed, STORY_TONE_WORDS) || listed(trimmed, STORY_LEAVING_PHRASES)) {
    return false;
  }
  return !usesAny(trimmed, STORY_VOICE_WORDS);
}

function childNouns(
  story: string,
  input: {
    readonly childName: string;
    readonly lines: readonly { readonly text: string; readonly field?: string }[];
  },
): Set<string> {
  const names = new Set(wordsIn(input.childName));
  const answerWords = new Set<string>();
  for (const line of input.lines) {
    if (line.field !== undefined && !NOUN_FIELDS.has(line.field)) continue;
    for (const word of wordsIn(line.text)) {
      if (!detailWord(word) || names.has(word)) continue;
      answerWords.add(word);
    }
  }
  const found = new Set<string>();
  for (const word of wordsIn(story)) {
    if (answerWords.has(word)) {
      found.add(word);
      continue;
    }
    if (word.length >= 4 && word.endsWith('s') && answerWords.has(word.slice(0, -1))) found.add(word.slice(0, -1));
    else if (word.length >= 4 && answerWords.has(`${word}s`)) found.add(word);
  }
  return found;
}

function detailWord(word: string): boolean {
  if (STORY_STOPWORDS.has(word) || SHORT_FUNCTION.has(word)) return false;
  return word.length >= 3;
}

function inventedChurchDetail(
  text: string,
  input: {
    readonly church: StoryChurch;
    readonly lines: readonly { readonly text: string }[];
  },
): boolean {
  const plan = new Set(wordsIn(input.church.plan));
  const parent = new Set(input.lines.flatMap((line) => wordsIn(line.text)));
  for (const word of INVENTED_CHURCH_WORDS) {
    if (plan.has(word)) continue;
    for (const sentence of sentencesIn(text)) {
      if (!hasTerm(sentence, word)) continue;
      const named = parent.has(word) && CHURCH_HEDGES.some((hedge) => hasTerm(sentence, hedge));
      if (!named) return true;
    }
  }
  return false;
}

function wordsIn(text: string): string[] {
  return text.toLowerCase().match(/\p{L}[\p{L}\p{N}]*/gu) ?? [];
}

function sentencesIn(body: string): string[] {
  const text = body.trim();
  if (text.length === 0) return [];
  const sentences: string[] = [];
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const mark = text[index];
    if (mark !== '.' && mark !== '!' && mark !== '?') continue;
    if (mark === '.' && ellipsisDot(text, index)) continue;
    const next = text[index + 1];
    if (next === '.' || next === '!' || next === '?') continue;
    if (mark === '.' && abbreviationBefore(text, index)) continue;
    if (mark === '.' && /\p{N}/u.test(text[index - 1] ?? '') && /\p{N}/u.test(next ?? '')) continue;
    sentences.push(text.slice(start, index + 1));
    start = index + 1;
  }
  const tail = text.slice(start);
  if (hasLetterOrNumber(tail)) sentences.push(tail);
  else if (sentences.length === 0 && hasLetterOrNumber(text)) sentences.push(text);
  return sentences;
}

export function parseSundayUpdate(
  value: unknown,
  notes: string,
  childName: string,
  signature: { readonly leader: string; readonly church: string },
): SundayUpdateDraft {
  if (!validateJson(sundayUpdateSchema, value) || !isRecord(value)) throw new SchemaRejected();
  if (typeof value.body !== 'string') throw new SchemaRejected();
  const stripped = stripLeaderPrefix(
    stripBracketPlaceholders(value.body),
    signature.leader,
    signature.church,
  );
  const prose = stripSundaySignOff(stripped, signature.leader, signature.church).trim();
  if (!updateBodyAccepted(prose, notes, childName)) throw new SchemaRejected();
  return { body: finishSundayNote(stripped, signature.leader, signature.church) };
}

export function finishSundayNote(body: string, leader: string, church: string): string {
  const signature = `\n\n${leader}\n${church}`;
  const room = Math.max(0, 2000 - signature.length);
  const prose = stripSundaySignOff(stripLeaderPrefix(body, leader, church), leader, church).trimEnd();
  const kept = prose.length > room ? prose.slice(0, room).trimEnd() : prose;
  return `${kept}${signature}`;
}

function signOffKey(line: string): string {
  const unlabeled = line.trim().replace(/^(?:leader|church|from)\s*:\s*/iu, '');
  return unlabeled.replace(/[^\p{L}\p{N}\s]+/gu, '').replace(/\s+/gu, ' ').trim().toLowerCase();
}

function stripLeaderPrefix(body: string, leader: string, church: string): string {
  const prefix = `${leader} at ${church}:`;
  const start = body.trimStart();
  if (!start.startsWith(prefix)) return body;
  return start.slice(prefix.length).replace(/^\s+/u, '');
}

function stripSundaySignOff(body: string, leader: string, church: string): string {
  const lines = body.replace(/[ \t]+$/gu, '').replace(/\n+$/u, '').split('\n');
  const leaderKey = signOffKey(leader);
  const churchKey = signOffKey(church);
  let removedName = false;
  while (lines.length > 0) {
    const last = lines[lines.length - 1]?.trim() ?? '';
    if (last.length === 0) {
      lines.pop();
      continue;
    }
    const key = signOffKey(last);
    const matchesLeader = leaderKey.length > 0 && key === leaderKey;
    const matchesChurch = churchKey.length > 0 && key === churchKey;
    if (matchesLeader || matchesChurch) {
      lines.pop();
      removedName = true;
      continue;
    }
    const closing = /^(?:blessings|warmly|thanks|love|from)$/iu.test(last.replace(/,/gu, '').trim());
    if (removedName && closing) {
      lines.pop();
      removedName = false;
      continue;
    }
    break;
  }
  return lines.join('\n');
}
