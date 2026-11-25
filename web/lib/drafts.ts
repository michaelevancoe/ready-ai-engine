import type { BriefLine, LessonAdaptation, SocialStory, SundayUpdate } from './visit';

export type DraftResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly message: string };

const FAILED = 'The draft could not be written. Try again.';
const DOWN = 'The local demo is not running.';
const CHECK = 'Check the answers and try again.';
const REQUEST = 'The request failed.';

const STORY_LINE_FIELDS = new Set<BriefLine['field']>([
  'loves',
  'overwhelms',
  'whatHelps',
  'communication',
  'sensory',
  'toileting',
  'calming',
]);

export function postSocialStory(
  lines: readonly BriefLine[],
  childName: string,
  church: {
    readonly name: string;
    readonly service: string;
    readonly room: string;
    readonly leader: string;
    readonly plan: string;
  },
): Promise<DraftResult<SocialStory>> {
  return post(
    '/v1/drafts/social-story',
    {
      lines: wireLines(lines.filter((line) => STORY_LINE_FIELDS.has(line.field))),
      childName,
      church,
    },
    readStory,
  );
}

export function postLesson(
  lesson: string,
  lines: readonly BriefLine[],
  childName: string,
): Promise<DraftResult<LessonAdaptation>> {
  return post('/v1/drafts/lesson', { lesson, lines: wireLines(lines), childName }, readLesson);
}

export function postSundayUpdate(notes: string, childName: string): Promise<DraftResult<SundayUpdate>> {
  return post('/v1/drafts/sunday-update', { notes, childName }, readUpdate);
}

export type AckPost =
  | {
      readonly kind: 'line';
      readonly relevant: boolean;
      readonly line: string;
      readonly clarifyingPrompt: string;
    }
  | { readonly kind: 'error' };

export function postAcknowledgement(answer: string, nodeId: string): Promise<AckPost> {
  return post('/v1/drafts/acknowledgement', { answer, nodeId }, readAcknowledgement).then((result) => {
    if (!result.ok) return { kind: 'error' };
    return { kind: 'line', ...result.value };
  });
}

function wireLines(lines: readonly BriefLine[]): { field: BriefLine['field']; label: string; text: string }[] {
  return lines.map((line) => ({ field: line.field, label: line.label, text: line.text }));
}

async function post<T>(path: string, body: unknown, parse: (value: unknown) => T | null): Promise<DraftResult<T>> {
  try {
    const response = await fetch(path, {
      method: 'POST',
      credentials: 'omit',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await readPayload(response);
    if (!response.ok) return { ok: false, message: messageFor(payload) };
    const value = parse(payload);
    if (value === null) return { ok: false, message: FAILED };
    return { ok: true, value };
  } catch {
    return { ok: false, message: DOWN };
  }
}

function messageFor(value: unknown): string {
  if (!isRecord(value) || typeof value.error !== 'string') return REQUEST;
  switch (value.error) {
    case 'invalid_input':
      return CHECK;
    case 'generation_failed':
      return FAILED;
    case 'misconfigured':
    case 'demo_off':
      return DOWN;
    default:
      return REQUEST;
  }
}

function readStory(value: unknown): SocialStory | null {
  if (!isRecord(value) || !isBounded(value.title, 1, 120) || !isBounded(value.body, 1, 2000)) return null;
  const source = storySource(value.source);
  if (source === null) return null;
  return { title: value.title, body: value.body, source };
}

function storySource(value: unknown): 'model' | 'fallback' | null {
  switch (value) {
    case 'model':
    case 'fallback':
      return value;
    default:
      return null;
  }
}

function readLesson(value: unknown): LessonAdaptation | null {
  if (!isRecord(value) || !isBounded(value.summary, 1, 600) || !Array.isArray(value.steps)) return null;
  if (value.steps.length < 1 || value.steps.length > 8) return null;
  const steps: string[] = [];
  for (const step of value.steps) {
    if (!isBounded(step, 1, 400)) return null;
    steps.push(step);
  }
  return { summary: value.summary, steps };
}

function readUpdate(value: unknown): SundayUpdate | null {
  if (!isRecord(value) || !isBounded(value.body, 1, 2000)) return null;
  return { body: value.body };
}

function readAcknowledgement(
  value: unknown,
): { relevant: boolean; line: string; clarifyingPrompt: string } | null {
  if (!isRecord(value) || typeof value.relevant !== 'boolean' || !isBounded(value.line, 1, 160)) return null;
  if (typeof value.clarifyingPrompt !== 'string' || value.clarifyingPrompt.length > 400) return null;
  return { relevant: value.relevant, line: value.line, clarifyingPrompt: value.clarifyingPrompt };
}

function isBounded(value: unknown, min: number, max: number): value is string {
  return typeof value === 'string' && value.length >= min && value.length <= max;
}

async function readPayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
