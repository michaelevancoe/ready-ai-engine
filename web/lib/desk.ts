export type AnswerField =
  | 'preferredName'
  | 'ageYears'
  | 'sensoryNotes'
  | 'supportNeeds'
  | 'whatHelps'
  | 'whatToAvoid';

export type AnswerDraft = Record<AnswerField, string>;

export interface IntakeAnswers {
  preferredName: string;
  ageYears: number;
  sensoryNotes: string;
  supportNeeds: string;
  whatHelps: string;
  whatToAvoid: string;
}

export interface FieldError {
  readonly field: AnswerField;
  readonly message: string;
}

declare const profileIdBrand: unique symbol;

export type ProfileId = string & { readonly [profileIdBrand]: 'ProfileId' };

export interface ProfileSection {
  readonly heading: string;
  readonly lines: readonly string[];
}

export interface ShownProfile {
  readonly id: ProfileId;
  readonly status: 'draft' | 'approved';
  readonly sections: readonly ProfileSection[];
}

export type PagePhase =
  | {
      readonly status: 'ready';
      readonly answers: AnswerDraft;
      readonly fieldErrors: readonly FieldError[];
      readonly focus: AnswerField | null;
      readonly fixReason: string;
    }
  | { readonly status: 'submitting'; readonly answers: AnswerDraft }
  | { readonly status: 'draft'; readonly answers: AnswerDraft; readonly profile: ShownProfile }
  | { readonly status: 'approving'; readonly answers: AnswerDraft; readonly profile: ShownProfile }
  | { readonly status: 'approved'; readonly answers: AnswerDraft; readonly profile: ShownProfile }
  | {
      readonly status: 'error';
      readonly answers: AnswerDraft;
      readonly message: string;
      readonly retry: 'submit';
      readonly profile: null;
    }
  | {
      readonly status: 'error';
      readonly answers: AnswerDraft;
      readonly message: string;
      readonly retry: 'approve';
      readonly profile: ShownProfile;
    };

export type PageEvent =
  | { readonly type: 'invalid'; readonly answers: AnswerDraft; readonly fieldErrors: readonly FieldError[] }
  | { readonly type: 'submit'; readonly answers: AnswerDraft }
  | { readonly type: 'draft'; readonly profile: ShownProfile }
  | { readonly type: 'approve' }
  | { readonly type: 'approved'; readonly profile: ShownProfile }
  | { readonly type: 'fail'; readonly message: string }
  | { readonly type: 'fix'; readonly section: ProfileSectionKey; readonly reason: string }
  | { readonly type: 'dismiss' };

export type ReadAnswers =
  | { readonly ok: true; readonly answers: IntakeAnswers; readonly draft: AnswerDraft }
  | { readonly ok: false; readonly draft: AnswerDraft; readonly fieldErrors: readonly FieldError[] };

export interface DeskField {
  readonly key: AnswerField;
  readonly label: string;
  readonly multiline: boolean;
  readonly value: string;
  readonly error: string | null;
}

export interface DeskView {
  readonly fields: readonly DeskField[];
  readonly banner: { readonly text: string; readonly tone: 'busy' | 'error' } | null;
  readonly sections: readonly ProfileSection[];
  readonly primary: 'submit' | 'approve' | null;
  readonly dismiss: boolean;
  readonly profile: ShownProfile | null;
  readonly statusLabel: 'Draft' | 'Approved' | null;
}

const PREFILL: AnswerDraft = {
  preferredName: 'Rowan',
  ageYears: '7',
  sensoryNotes: '',
  supportNeeds: 'A quiet seat near the door.',
  whatHelps: 'A warning before music.',
  whatToAvoid: 'Surprise loud songs.',
};

const AGE_MESSAGE = 'Enter a whole age from 0 through 18.';

const LOCAL_DEMO_DOWN = 'The local demo is not running.';

const SENTENCES = {
  invalid_input: 'Check the answers and try again.',
  generation_failed: 'The draft could not be written. Submit the form again.',
  misconfigured: LOCAL_DEMO_DOWN,
  unauthorized: 'The local demo session was rejected.',
  forbidden: 'This session cannot change that profile.',
  not_found: 'That profile is not in the local demo.',
  request_failed: 'The request failed.',
  demo_off: LOCAL_DEMO_DOWN,
} as const;

const FIELDS: readonly { key: AnswerField; label: string; multiline: boolean }[] = [
  { key: 'preferredName', label: 'Preferred name', multiline: false },
  { key: 'ageYears', label: 'Age', multiline: false },
  { key: 'sensoryNotes', label: 'Sensory notes', multiline: true },
  { key: 'supportNeeds', label: 'Support needs', multiline: true },
  { key: 'whatHelps', label: 'What helps', multiline: true },
  { key: 'whatToAvoid', label: 'What to avoid', multiline: true },
];

interface ProfileText {
  summary: string;
  sensoryConsiderations: readonly string[];
  supportStrategies: readonly string[];
  avoid: readonly string[];
  volunteerGuidance: string;
}

export const PROFILE_SECTIONS = [
  ['summary', 'Summary'],
  ['sensoryConsiderations', 'Sensory considerations'],
  ['supportStrategies', 'Support strategies'],
  ['avoid', 'Avoid'],
  ['volunteerGuidance', 'Volunteer guidance'],
] as const satisfies ReadonlyArray<readonly [keyof ProfileText, string]>;

export type ProfileSectionKey = (typeof PROFILE_SECTIONS)[number][0];

export function spaceSentences(value: string): string {
  return value.replace(/([.!?])(\p{L})/gu, '$1 $2');
}

export function initialPhase(): PagePhase {
  return { status: 'ready', answers: { ...PREFILL }, fieldErrors: [], focus: null, fixReason: '' };
}

export function isProfileSection(value: string): value is ProfileSectionKey {
  return PROFILE_SECTIONS.some(([key]) => key === value);
}

function focusFor(section: ProfileSectionKey, answers: AnswerDraft): AnswerField {
  switch (section) {
    case 'summary':
      return 'preferredName';
    case 'sensoryConsiderations':
      return 'sensoryNotes';
    case 'supportStrategies':
      return answers.whatHelps.length > 0 ? 'whatHelps' : 'supportNeeds';
    case 'avoid':
      return 'whatToAvoid';
    case 'volunteerGuidance':
      return 'whatHelps';
    default: {
      const leftover: never = section;
      return leftover;
    }
  }
}

export function reducePage(phase: PagePhase, event: PageEvent): PagePhase {
  switch (event.type) {
    case 'invalid':
      if (phase.status === 'ready' || (phase.status === 'error' && phase.retry === 'submit')) {
        return {
          status: 'ready',
          answers: event.answers,
          fieldErrors: event.fieldErrors,
          focus: null,
          fixReason: '',
        };
      }
      return phase;
    case 'submit':
      if (phase.status === 'ready' || (phase.status === 'error' && phase.retry === 'submit')) {
        return { status: 'submitting', answers: event.answers };
      }
      return phase;
    case 'draft':
      if (phase.status === 'submitting') {
        return { status: 'draft', answers: phase.answers, profile: event.profile };
      }
      return phase;
    case 'approve':
      if (phase.status === 'draft') {
        return { status: 'approving', answers: phase.answers, profile: phase.profile };
      }
      return phase;
    case 'approved':
      if (phase.status === 'approving' || phase.status === 'approved') {
        return { status: 'approved', answers: phase.answers, profile: event.profile };
      }
      return phase;
    case 'fail':
      if (phase.status === 'submitting') {
        return {
          status: 'error',
          answers: phase.answers,
          message: event.message,
          retry: 'submit',
          profile: null,
        };
      }
      if (phase.status === 'approving') {
        return {
          status: 'error',
          answers: phase.answers,
          message: event.message,
          retry: 'approve',
          profile: phase.profile,
        };
      }
      return phase;
    case 'fix': {
      if (phase.status !== 'draft') return phase;
      const reason = event.reason.trim();
      if (reason.length === 0) return phase;
      return {
        status: 'ready',
        answers: phase.answers,
        fieldErrors: [],
        focus: focusFor(event.section, phase.answers),
        fixReason: reason,
      };
    }
    case 'dismiss':
      if (phase.status === 'error' && phase.retry === 'submit') {
        return { status: 'ready', answers: phase.answers, fieldErrors: [], focus: null, fixReason: '' };
      }
      if (phase.status === 'error' && phase.retry === 'approve') {
        return { status: 'draft', answers: phase.answers, profile: phase.profile };
      }
      return phase;
    default: {
      const leftover: never = event;
      return leftover;
    }
  }
}

export function viewOf(phase: PagePhase): DeskView {
  const fields = fieldViews(phase.answers, phase.status === 'ready' ? phase.fieldErrors : []);
  switch (phase.status) {
    case 'ready':
      return {
        fields,
        banner: null,
        sections: [],
        primary: 'submit',
        dismiss: false,
        profile: null,
        statusLabel: null,
      };
    case 'submitting':
      return {
        fields,
        banner: { text: 'Writing the draft.', tone: 'busy' },
        sections: [],
        primary: null,
        dismiss: false,
        profile: null,
        statusLabel: null,
      };
    case 'draft':
      return {
        fields,
        banner: null,
        sections: phase.profile.sections,
        primary: 'approve',
        dismiss: false,
        profile: phase.profile,
        statusLabel: 'Draft',
      };
    case 'approving':
      return {
        fields,
        banner: { text: 'Approving the profile.', tone: 'busy' },
        sections: phase.profile.sections,
        primary: null,
        dismiss: false,
        profile: phase.profile,
        statusLabel: 'Draft',
      };
    case 'approved':
      return {
        fields,
        banner: null,
        sections: phase.profile.sections,
        primary: null,
        dismiss: false,
        profile: phase.profile,
        statusLabel: 'Approved',
      };
    case 'error':
      return errorView(phase, fields);
    default: {
      const leftover: never = phase;
      return leftover;
    }
  }
}

export function readAnswers(fields: AnswerDraft): ReadAnswers {
  const age = wholeAge(fields.ageYears);
  if (age === null) {
    return {
      ok: false,
      draft: fields,
      fieldErrors: [{ field: 'ageYears', message: AGE_MESSAGE }],
    };
  }
  return {
    ok: true,
    draft: fields,
    answers: {
      preferredName: fields.preferredName,
      ageYears: age,
      sensoryNotes: fields.sensoryNotes,
      supportNeeds: fields.supportNeeds,
      whatHelps: fields.whatHelps,
      whatToAvoid: fields.whatToAvoid,
    },
  };
}

export async function submitIntake(
  answers: IntakeAnswers,
): Promise<Extract<PageEvent, { type: 'draft' | 'fail' }>> {
  try {
    const response = await fetch('/v1/intake/profile', {
      method: 'POST',
      credentials: 'omit',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        preferredName: answers.preferredName,
        ageYears: answers.ageYears,
        sensoryNotes: answers.sensoryNotes,
        supportNeeds: answers.supportNeeds,
        whatHelps: answers.whatHelps,
        whatToAvoid: answers.whatToAvoid,
      }),
    });
    const body = await readBody(response);
    if (response.status === 201) {
      const profile = shownProfile(body, 'draft');
      if (profile !== null) return { type: 'draft', profile };
    }
    return { type: 'fail', message: messageFor(body) };
  } catch {
    return { type: 'fail', message: LOCAL_DEMO_DOWN };
  }
}

export async function approveProfile(
  profile: ShownProfile,
): Promise<Extract<PageEvent, { type: 'approved' | 'fail' }>> {
  try {
    const response = await fetch(`/v1/profiles/${encodeURIComponent(profile.id)}/approve`, {
      method: 'POST',
      credentials: 'omit',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    const body = await readBody(response);
    if (response.status === 200) {
      const next = shownProfile(body, 'approved');
      if (next !== null) return { type: 'approved', profile: next };
    }
    if (response.status === 409 && isRecord(body) && body.error === 'already_approved') {
      return { type: 'approved', profile: { ...profile, status: 'approved' } };
    }
    return { type: 'fail', message: messageFor(body) };
  } catch {
    return { type: 'fail', message: LOCAL_DEMO_DOWN };
  }
}

function fieldViews(answers: AnswerDraft, errors: readonly FieldError[]): DeskField[] {
  return FIELDS.map((field) => ({
    key: field.key,
    label: field.label,
    multiline: field.multiline,
    value: answers[field.key],
    error: errors.find((item) => item.field === field.key)?.message ?? null,
  }));
}

function errorView(phase: Extract<PagePhase, { status: 'error' }>, fields: readonly DeskField[]): DeskView {
  const banner = { text: phase.message, tone: 'error' as const };
  switch (phase.retry) {
    case 'submit':
      return {
        fields,
        banner,
        sections: [],
        primary: null,
        dismiss: true,
        profile: null,
        statusLabel: null,
      };
    case 'approve':
      return {
        fields,
        banner,
        sections: phase.profile.sections,
        primary: null,
        dismiss: true,
        profile: phase.profile,
        statusLabel: 'Draft',
      };
    default: {
      const leftover: never = phase;
      return leftover;
    }
  }
}

function wholeAge(token: string): number | null {
  if (!/^(0|[1-9]\d*)$/.test(token)) return null;
  const age = Number(token);
  if (age > 18) return null;
  return age;
}

function sentenceFor(code: string): string {
  if (Object.hasOwn(SENTENCES, code)) return SENTENCES[code as keyof typeof SENTENCES];
  return SENTENCES.request_failed;
}

function messageFor(value: unknown): string {
  if (isRecord(value) && typeof value.error === 'string') return sentenceFor(value.error);
  return SENTENCES.request_failed;
}

async function readBody(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

function shownProfile(value: unknown, status: 'draft' | 'approved'): ShownProfile | null {
  if (!isRecord(value) || value.status !== status || typeof value.id !== 'string' || value.id.length === 0) {
    return null;
  }
  const text = profileText(value.profile);
  if (text === null) return null;
  return { id: value.id as ProfileId, status, sections: sectionsFrom(text) };
}

function profileText(value: unknown): ProfileText | null {
  if (!isRecord(value)) return null;
  const sensoryConsiderations = stringList(value.sensoryConsiderations);
  const supportStrategies = stringList(value.supportStrategies);
  const avoid = stringList(value.avoid);
  if (
    typeof value.summary !== 'string' ||
    typeof value.volunteerGuidance !== 'string' ||
    sensoryConsiderations === null ||
    supportStrategies === null ||
    avoid === null
  ) {
    return null;
  }
  return {
    summary: value.summary,
    sensoryConsiderations,
    supportStrategies,
    avoid,
    volunteerGuidance: value.volunteerGuidance,
  };
}

function sectionsFrom(
  profile: ProfileText & Record<Exclude<keyof ProfileText, ProfileSectionKey>, never>,
): ProfileSection[] {
  return PROFILE_SECTIONS.map(([key, heading]) => {
    const value = profile[key];
    const source = typeof value === 'string' ? [value] : value;
    return { heading, lines: source.map((line) => spaceSentences(line)) };
  });
}

function stringList(value: unknown): string[] | null {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) return null;
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
