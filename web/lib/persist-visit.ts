import {
  BRIEF_FIELDS,
  briefLines,
  type BriefLine,
  type ChurchSetup,
  type ProfileCard,
  type Visit,
  type Visibility,
} from './visit.ts';

export interface AccountScope {
  readonly organizationId: string;
  readonly childId: string;
}

export interface AnswerPersist {
  readonly organizationId: string;
  readonly childId: string;
  readonly answers: Visit['conversation']['answers'];
}

export interface BriefPersist {
  readonly organizationId: string;
  readonly childId: string;
  readonly card: ProfileCard;
  readonly visibility: Visibility;
  readonly cardTouched: boolean;
}

export type PublicationPersist =
  | {
      readonly action: 'upsert';
      readonly organizationId: string;
      readonly childId: string;
      readonly lines: readonly BriefLine[];
    }
  | { readonly action: 'delete'; readonly organizationId: string; readonly childId: string };

export interface NotePersist {
  readonly organizationId: string;
  readonly childId: string;
  readonly body: string;
}

export interface ChurchPersist {
  readonly organizationId: string;
  readonly church: ChurchSetup;
}

export type LessonPersist =
  | {
      readonly action: 'upsert';
      readonly organizationId: string;
      readonly source: string;
      readonly summary: string;
      readonly steps: readonly string[];
    }
  | { readonly action: 'delete'; readonly organizationId: string };

export type UpdatePersist =
  | { readonly action: 'upsert'; readonly organizationId: string; readonly childId: string; readonly body: string }
  | { readonly action: 'delete'; readonly organizationId: string; readonly childId: string };

export interface PersistPlan {
  readonly answers: AnswerPersist | null;
  readonly brief: BriefPersist | null;
  readonly publication: PublicationPersist | null;
  readonly notes: NotePersist | null;
  readonly church: ChurchPersist | null;
  readonly lesson: LessonPersist | null;
  readonly update: UpdatePersist | null;
}

export function persistDispatch(before: Visit, after: Visit, scope: AccountScope): PersistPlan {
  return {
    answers: sameAnswers(before.conversation.answers, after.conversation.answers)
      ? null
      : { organizationId: scope.organizationId, childId: scope.childId, answers: after.conversation.answers },
    brief: sameBrief(before, after)
      ? null
      : {
          organizationId: scope.organizationId,
          childId: scope.childId,
          card: after.card,
          visibility: after.visibility,
          cardTouched: after.cardTouched,
        },
    publication: publicationChange(before, after, scope),
    notes:
      before.notes === after.notes
        ? null
        : { organizationId: scope.organizationId, childId: scope.childId, body: after.notes },
    church: sameChurch(before.church, after.church)
      ? null
      : { organizationId: scope.organizationId, church: after.church },
    lesson: lessonChange(before, after, scope),
    update: updateChange(before, after, scope),
  };
}

export function emptyPlan(plan: PersistPlan): boolean {
  return (
    plan.answers === null &&
    plan.brief === null &&
    plan.publication === null &&
    plan.notes === null &&
    plan.church === null &&
    plan.lesson === null &&
    plan.update === null
  );
}

function publicationChange(before: Visit, after: Visit, scope: AccountScope): PublicationPersist | null {
  const previous = publishedLines(before);
  const next = publishedLines(after);
  if (previous === null && next === null) return null;
  if (previous !== null && next !== null && sameLines(previous, next)) return null;
  if (next === null) {
    return { action: 'delete', organizationId: scope.organizationId, childId: scope.childId };
  }
  return { action: 'upsert', organizationId: scope.organizationId, childId: scope.childId, lines: next };
}

function lessonChange(before: Visit, after: Visit, scope: AccountScope): LessonPersist | null {
  const previous = approvedLesson(before);
  const next = approvedLesson(after);
  if (previous === null && next === null) return null;
  if (previous !== null && next !== null && sameLesson(previous, next)) return null;
  if (next === null) return { action: 'delete', organizationId: scope.organizationId };
  return { action: 'upsert', organizationId: scope.organizationId, ...next };
}

function updateChange(before: Visit, after: Visit, scope: AccountScope): UpdatePersist | null {
  const previous = approvedBody(before);
  const next = approvedBody(after);
  if (previous === next) return null;
  if (next === null) {
    return { action: 'delete', organizationId: scope.organizationId, childId: scope.childId };
  }
  return { action: 'upsert', organizationId: scope.organizationId, childId: scope.childId, body: next };
}

function publishedLines(visit: Visit): readonly BriefLine[] | null {
  if (visit.brief.phase !== 'approved') return null;
  return briefLines(visit.card, visit.visibility).filter((line) => line.field !== 'medical');
}

function approvedLesson(visit: Visit): { source: string; summary: string; steps: readonly string[] } | null {
  if (visit.lesson.phase !== 'approved') return null;
  return {
    source: visit.lessonSource,
    summary: visit.lesson.value.summary,
    steps: visit.lesson.value.steps,
  };
}

function approvedBody(visit: Visit): string | null {
  if (visit.update.phase !== 'approved') return null;
  return visit.update.value.body;
}

function sameAnswers(left: Visit['conversation']['answers'], right: Visit['conversation']['answers']): boolean {
  const leftKeys = Object.keys(left);
  if (leftKeys.length !== Object.keys(right).length) return false;
  for (const key of leftKeys) {
    const before = left[key];
    const after = right[key];
    if (before === undefined || after === undefined || before.text !== after.text) return false;
  }
  return true;
}

function sameBrief(before: Visit, after: Visit): boolean {
  if (before.cardTouched !== after.cardTouched) return false;
  for (const field of BRIEF_FIELDS) {
    if (before.card[field] !== after.card[field]) return false;
    if (before.visibility[field] !== after.visibility[field]) return false;
  }
  return true;
}

function sameChurch(before: ChurchSetup, after: ChurchSetup): boolean {
  return (
    before.name === after.name &&
    before.service === after.service &&
    before.room === after.room &&
    before.leader === after.leader &&
    before.ages === after.ages &&
    before.plan === after.plan
  );
}

function sameLines(left: readonly BriefLine[], right: readonly BriefLine[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((line, index) => {
    const other = right[index];
    return other !== undefined && line.field === other.field && line.text === other.text;
  });
}

function sameLesson(
  left: { source: string; summary: string; steps: readonly string[] },
  right: { source: string; summary: string; steps: readonly string[] },
): boolean {
  if (left.source !== right.source || left.summary !== right.summary || left.steps.length !== right.steps.length) {
    return false;
  }
  return left.steps.every((step, index) => step === right.steps[index]);
}
