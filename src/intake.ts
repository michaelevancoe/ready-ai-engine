import { isUuid } from './ids.ts';
import type { ChatMessage } from './generate.ts';
import { isRecord } from './schema.ts';

export interface IntakeAnswers {
  preferredName: string;
  ageYears: number;
  sensoryNotes: string;
  supportNeeds: string;
  whatHelps: string;
  whatToAvoid: string;
}

export interface IntakeRequest {
  organizationId: string;
  childId: string;
  answers: IntakeAnswers;
}

const ANSWER_KEYS = [
  'preferredName',
  'ageYears',
  'sensoryNotes',
  'supportNeeds',
  'whatHelps',
  'whatToAvoid',
] as const;

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function isBoundedString(value: unknown, min: number, max: number): value is string {
  return typeof value === 'string' && value.length >= min && value.length <= max;
}

export function parseIntake(value: unknown): IntakeRequest | null {
  if (!isRecord(value) || !hasExactKeys(value, ['organizationId', 'childId', 'answers'])) return null;
  if (typeof value.organizationId !== 'string' || !isUuid(value.organizationId)) return null;
  if (typeof value.childId !== 'string' || !isUuid(value.childId)) return null;
  if (!isRecord(value.answers) || !hasExactKeys(value.answers, ANSWER_KEYS)) return null;
  const answers = value.answers;
  if (!isBoundedString(answers.preferredName, 1, 80) || answers.preferredName.trim() === '') return null;
  if (
    typeof answers.ageYears !== 'number' ||
    !Number.isInteger(answers.ageYears) ||
    answers.ageYears < 0 ||
    answers.ageYears > 18
  ) {
    return null;
  }
  if (!isBoundedString(answers.sensoryNotes, 0, 2000)) return null;
  if (!isBoundedString(answers.supportNeeds, 0, 2000)) return null;
  if (!isBoundedString(answers.whatHelps, 0, 2000)) return null;
  if (!isBoundedString(answers.whatToAvoid, 0, 2000)) return null;
  return {
    organizationId: value.organizationId,
    childId: value.childId,
    answers: {
      preferredName: answers.preferredName,
      ageYears: answers.ageYears,
      sensoryNotes: answers.sensoryNotes,
      supportNeeds: answers.supportNeeds,
      whatHelps: answers.whatHelps,
      whatToAvoid: answers.whatToAvoid,
    },
  };
}

export function intakeMessages(answers: IntakeAnswers): ChatMessage[] {
  return [
    {
      role: 'system',
      content:
        'Write a draft child profile for a parent to approve before anyone else sees it. Return JSON only, matching the schema. volunteerGuidance must help a Sunday volunteer without repeating the child\'s name.',
    },
    {
      role: 'user',
      content: JSON.stringify({
        preferredName: answers.preferredName,
        ageYears: answers.ageYears,
        sensoryNotes: answers.sensoryNotes,
        supportNeeds: answers.supportNeeds,
        whatHelps: answers.whatHelps,
        whatToAvoid: answers.whatToAvoid,
      }),
    },
  ];
}
