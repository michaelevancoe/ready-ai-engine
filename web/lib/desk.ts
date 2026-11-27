import { filterWhatHelps } from '../../src/what-helps.ts';

export interface IntakeAnswers {
  preferredName: string;
  ageYears: number;
  sensoryNotes: string;
  supportNeeds: string;
  whatHelps: string;
  whatToAvoid: string;
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
  readonly whatHelps: readonly string[];
}

export type IntakeGate =
  | { readonly status: 'idle' }
  | { readonly status: 'submitting'; readonly nonce: number }
  | { readonly status: 'draft'; readonly profile: ShownProfile }
  | { readonly status: 'approving'; readonly profile: ShownProfile }
  | { readonly status: 'approved'; readonly profile: ShownProfile }
  | {
      readonly status: 'error';
      readonly message: string;
      readonly retry: 'submit';
      readonly profile: null;
    }
  | {
      readonly status: 'error';
      readonly message: string;
      readonly retry: 'approve';
      readonly profile: ShownProfile;
    };

export type GateEvent =
  | { readonly type: 'submit'; readonly nonce: number }
  | { readonly type: 'draft'; readonly profile: ShownProfile; readonly nonce: number }
  | { readonly type: 'approve' }
  | { readonly type: 'approved'; readonly profile: ShownProfile }
  | { readonly type: 'fail'; readonly message: string; readonly nonce?: number }
  | { readonly type: 'dismiss' };

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

const SECTION_HEADINGS = [
  ['summary', 'Summary'],
  ['sensoryConsiderations', 'Sensory considerations'],
  ['supportStrategies', 'Support strategies'],
  ['avoid', 'Avoid'],
  ['volunteerGuidance', 'Volunteer guidance'],
] as const;

interface ProfileText {
  summary: string;
  sensoryConsiderations: readonly string[];
  supportStrategies: readonly string[];
  avoid: readonly string[];
  volunteerGuidance: string;
}

export function spaceSentences(value: string): string {
  return value.replace(/([.!?])(\p{L})/gu, '$1 $2');
}

export function initialGate(): IntakeGate {
  return { status: 'idle' };
}

export function reduceGate(gate: IntakeGate, event: GateEvent): IntakeGate {
  switch (event.type) {
    case 'submit':
      if (gate.status === 'idle' || (gate.status === 'error' && gate.retry === 'submit')) {
        return { status: 'submitting', nonce: event.nonce };
      }
      return gate;
    case 'draft':
      if (gate.status === 'submitting' && gate.nonce === event.nonce) {
        return { status: 'draft', profile: event.profile };
      }
      return gate;
    case 'approve':
      if (gate.status === 'draft') return { status: 'approving', profile: gate.profile };
      return gate;
    case 'approved':
      if (gate.status === 'approving' || gate.status === 'approved') {
        return { status: 'approved', profile: event.profile };
      }
      return gate;
    case 'fail':
      if (gate.status === 'submitting' && gate.nonce === event.nonce) {
        return { status: 'error', message: event.message, retry: 'submit', profile: null };
      }
      if (gate.status === 'approving') {
        return { status: 'error', message: event.message, retry: 'approve', profile: gate.profile };
      }
      return gate;
    case 'dismiss':
      if (gate.status === 'error' && gate.retry === 'submit') return { status: 'idle' };
      if (gate.status === 'error' && gate.retry === 'approve') return { status: 'draft', profile: gate.profile };
      return gate;
    default: {
      const leftover: never = event;
      return leftover;
    }
  }
}

export type IntakeResult =
  | { readonly type: 'draft'; readonly profile: ShownProfile }
  | { readonly type: 'fail'; readonly message: string };

export async function submitIntake(answers: IntakeAnswers): Promise<IntakeResult> {
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
): Promise<Extract<GateEvent, { type: 'approved' | 'fail' }>> {
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
  return { id: value.id as ProfileId, status, sections: sectionsFrom(text), whatHelps: helpsFrom(value.profile) };
}

function helpsFrom(value: unknown): readonly string[] {
  if (!isRecord(value)) return [];
  const raw = stringList(value.whatHelps);
  if (raw === null) return [];
  const kept = filterWhatHelps(raw);
  return kept.length >= 3 ? kept : [];
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

function sectionsFrom(profile: ProfileText): ProfileSection[] {
  return SECTION_HEADINGS.map(([key, heading]) => {
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
