import { isUuid } from '../../src/ids.ts';
import { isRecord } from '../../src/schema.ts';
import type { AccountScope, PersistPlan } from '../lib/persist-visit.ts';
import { BRIEF_FIELDS, type BriefField, type ProfileCard, type Visibility } from '../lib/visit.ts';

export type VisitWrite =
  | {
      readonly method: 'POST';
      readonly table: string;
      readonly conflict: string;
      readonly row: Record<string, unknown>;
    }
  | { readonly method: 'DELETE'; readonly table: string; readonly query: string };

const TEXT_COLUMN: Record<BriefField, string> = {
  loves: 'loves',
  overwhelms: 'overwhelms',
  whatHelps: 'what_helps',
  communication: 'communication',
  sensory: 'sensory',
  toileting: 'toileting',
  allergies: 'allergies',
  calming: 'calming',
  medical: 'medical',
};

export function visitWrites(userId: string, scope: AccountScope, plan: PersistPlan): VisitWrite[] {
  const writes: VisitWrite[] = [];
  if (plan.answers !== null) {
    writes.push({
      method: 'POST',
      table: 'intake_answers',
      conflict: 'organization_id,child_id',
      row: {
        organization_id: scope.organizationId,
        child_id: scope.childId,
        user_id: userId,
        answers: plan.answers.answers,
      },
    });
  }
  if (plan.brief !== null) {
    writes.push({
      method: 'POST',
      table: 'parent_briefs',
      conflict: 'child_id',
      row: briefRow(userId, scope, plan.brief.card, plan.brief.visibility, plan.brief.cardTouched),
    });
  }
  if (plan.publication?.action === 'upsert') {
    writes.push({
      method: 'POST',
      table: 'brief_publications',
      conflict: 'organization_id,child_id',
      row: {
        organization_id: scope.organizationId,
        child_id: scope.childId,
        user_id: userId,
        lines: plan.publication.lines.map((line) => ({ field: line.field, text: line.text })),
      },
    });
  }
  if (plan.publication?.action === 'delete') {
    writes.push({
      method: 'DELETE',
      table: 'brief_publications',
      query: `organization_id=eq.${scope.organizationId}&child_id=eq.${scope.childId}`,
    });
  }
  if (plan.notes !== null) {
    writes.push({
      method: 'POST',
      table: 'volunteer_notes',
      conflict: 'user_id,child_id',
      row: {
        user_id: userId,
        child_id: scope.childId,
        organization_id: scope.organizationId,
        body: plan.notes.body,
      },
    });
  }
  if (plan.church !== null) {
    writes.push({
      method: 'POST',
      table: 'church_setup',
      conflict: 'organization_id',
      row: {
        organization_id: scope.organizationId,
        name: plan.church.church.name,
        service: plan.church.church.service,
        room: plan.church.church.room,
        leader_label: plan.church.church.leader,
        ages: plan.church.church.ages,
        plan: plan.church.church.plan,
      },
    });
  }
  if (plan.lesson?.action === 'upsert') {
    writes.push({
      method: 'POST',
      table: 'lessons',
      conflict: 'organization_id',
      row: {
        id: scope.organizationId,
        organization_id: scope.organizationId,
        author_user_id: userId,
        source: plan.lesson.source,
        summary: plan.lesson.summary,
        steps: plan.lesson.steps,
        status: 'approved',
        title: plan.lesson.summary.trim().length > 0 ? plan.lesson.summary : 'Lesson',
        body: '',
      },
    });
  }
  if (plan.lesson?.action === 'delete') {
    writes.push({
      method: 'DELETE',
      table: 'lessons',
      query: `organization_id=eq.${scope.organizationId}`,
    });
  }
  if (plan.update?.action === 'upsert') {
    writes.push({
      method: 'POST',
      table: 'sunday_updates',
      conflict: 'child_id',
      row: {
        child_id: scope.childId,
        organization_id: scope.organizationId,
        author_user_id: userId,
        body: plan.update.body,
        status: 'approved',
      },
    });
  }
  if (plan.update?.action === 'delete') {
    writes.push({
      method: 'DELETE',
      table: 'sunday_updates',
      query: `child_id=eq.${scope.childId}`,
    });
  }
  return writes;
}

export function parseSyncBody(value: unknown): { scope: AccountScope; plan: PersistPlan } | null {
  if (!isRecord(value) || !isRecord(value.scope) || !isRecord(value.plan)) return null;
  const scope = parseScope(value.scope);
  if (scope === null) return null;
  const plan = parsePlan(value.plan, scope);
  if (plan === null) return null;
  return { scope, plan };
}

export function userIdFromAuthorization(header: string | null): string | null {
  if (header === null) return null;
  const match = /^Bearer (\S+)$/.exec(header);
  const token = match?.[1];
  if (token === undefined) return null;
  const payload = token.split('.')[1];
  if (payload === undefined) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as unknown;
    if (!isRecord(parsed) || typeof parsed.sub !== 'string' || !isUuid(parsed.sub)) return null;
    return parsed.sub;
  } catch {
    return null;
  }
}

function briefRow(
  userId: string,
  scope: AccountScope,
  card: ProfileCard,
  visibility: Visibility,
  cardTouched: boolean,
): Record<string, unknown> {
  const row: Record<string, unknown> = {
    child_id: scope.childId,
    organization_id: scope.organizationId,
    user_id: userId,
    card_touched: cardTouched,
  };
  for (const field of BRIEF_FIELDS) {
    const column = TEXT_COLUMN[field];
    row[column] = card[field];
    row[`show_${column}`] = visibility[field];
  }
  return row;
}

function parseScope(value: Record<string, unknown>): AccountScope | null {
  if (typeof value.organizationId !== 'string' || !isUuid(value.organizationId)) return null;
  if (typeof value.childId !== 'string' || !isUuid(value.childId)) return null;
  return { organizationId: value.organizationId, childId: value.childId };
}

function parsePlan(value: Record<string, unknown>, scope: AccountScope): PersistPlan | null {
  const answers = parseAnswers(value.answers, scope);
  const brief = parseBrief(value.brief, scope);
  const publication = parsePublication(value.publication, scope);
  const notes = parseNotes(value.notes, scope);
  const church = parseChurch(value.church, scope);
  const lesson = parseLesson(value.lesson, scope);
  const update = parseUpdate(value.update, scope);
  if (
    answers === undefined ||
    brief === undefined ||
    publication === undefined ||
    notes === undefined ||
    church === undefined ||
    lesson === undefined ||
    update === undefined
  ) {
    return null;
  }
  return { answers, brief, publication, notes, church, lesson, update };
}

function parseAnswers(value: unknown, scope: AccountScope): PersistPlan['answers'] | undefined {
  if (value === null) return null;
  if (!isRecord(value) || !sameChild(value, scope) || !isRecord(value.answers)) return undefined;
  const answers: Record<string, { kind: 'answered'; text: string }> = {};
  for (const [key, answer] of Object.entries(value.answers)) {
    if (!isRecord(answer) || answer.kind !== 'answered' || typeof answer.text !== 'string') return undefined;
    answers[key] = { kind: 'answered', text: answer.text };
  }
  return { organizationId: scope.organizationId, childId: scope.childId, answers };
}

function parseBrief(value: unknown, scope: AccountScope): PersistPlan['brief'] | undefined {
  if (value === null) return null;
  if (!isRecord(value) || !sameChild(value, scope) || typeof value.cardTouched !== 'boolean') return undefined;
  if (!isRecord(value.card) || !isRecord(value.visibility)) return undefined;
  const card = {} as ProfileCard;
  const visibility = {} as Visibility;
  for (const field of BRIEF_FIELDS) {
    const text = value.card[field];
    const shown = value.visibility[field];
    if (typeof text !== 'string' || typeof shown !== 'boolean') return undefined;
    card[field] = text;
    visibility[field] = shown;
  }
  return {
    organizationId: scope.organizationId,
    childId: scope.childId,
    card,
    visibility,
    cardTouched: value.cardTouched,
  };
}

function parsePublication(value: unknown, scope: AccountScope): PersistPlan['publication'] | undefined {
  if (value === null) return null;
  if (!isRecord(value) || !sameChild(value, scope)) return undefined;
  if (value.action === 'delete') {
    return { action: 'delete', organizationId: scope.organizationId, childId: scope.childId };
  }
  if (value.action !== 'upsert' || !Array.isArray(value.lines)) return undefined;
  const lines = [];
  for (const line of value.lines) {
    if (!isRecord(line) || typeof line.text !== 'string' || !isBriefField(line.field) || line.field === 'medical') {
      return undefined;
    }
    lines.push({ field: line.field, label: line.field, text: line.text });
  }
  return { action: 'upsert', organizationId: scope.organizationId, childId: scope.childId, lines };
}

function parseNotes(value: unknown, scope: AccountScope): PersistPlan['notes'] | undefined {
  if (value === null) return null;
  if (!isRecord(value) || !sameChild(value, scope) || typeof value.body !== 'string') return undefined;
  return { organizationId: scope.organizationId, childId: scope.childId, body: value.body };
}

function parseChurch(value: unknown, scope: AccountScope): PersistPlan['church'] | undefined {
  if (value === null) return null;
  if (!isRecord(value) || value.organizationId !== scope.organizationId || !isRecord(value.church)) return undefined;
  const church = value.church;
  if (
    typeof church.name !== 'string' ||
    typeof church.service !== 'string' ||
    typeof church.room !== 'string' ||
    typeof church.leader !== 'string' ||
    typeof church.ages !== 'string' ||
    typeof church.plan !== 'string'
  ) {
    return undefined;
  }
  return {
    organizationId: scope.organizationId,
    church: {
      name: church.name,
      service: church.service,
      room: church.room,
      leader: church.leader,
      ages: church.ages,
      plan: church.plan,
    },
  };
}

function parseLesson(value: unknown, scope: AccountScope): PersistPlan['lesson'] | undefined {
  if (value === null) return null;
  if (!isRecord(value) || value.organizationId !== scope.organizationId) return undefined;
  if (value.action === 'delete') return { action: 'delete', organizationId: scope.organizationId };
  if (value.action !== 'upsert' || typeof value.source !== 'string' || typeof value.summary !== 'string') {
    return undefined;
  }
  if (!Array.isArray(value.steps)) return undefined;
  const steps: string[] = [];
  for (const step of value.steps) {
    if (typeof step !== 'string') return undefined;
    steps.push(step);
  }
  return {
    action: 'upsert',
    organizationId: scope.organizationId,
    source: value.source,
    summary: value.summary,
    steps,
  };
}

function parseUpdate(value: unknown, scope: AccountScope): PersistPlan['update'] | undefined {
  if (value === null) return null;
  if (!isRecord(value) || !sameChild(value, scope)) return undefined;
  if (value.action === 'delete') {
    return { action: 'delete', organizationId: scope.organizationId, childId: scope.childId };
  }
  if (value.action !== 'upsert' || typeof value.body !== 'string') return undefined;
  return { action: 'upsert', organizationId: scope.organizationId, childId: scope.childId, body: value.body };
}

function sameChild(value: Record<string, unknown>, scope: AccountScope): boolean {
  return value.organizationId === scope.organizationId && value.childId === scope.childId;
}

function isBriefField(value: unknown): value is BriefField {
  return typeof value === 'string' && BRIEF_FIELDS.some((field) => field === value);
}
