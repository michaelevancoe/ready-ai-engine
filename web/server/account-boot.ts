import { chooseChurch, type ChurchMembership } from '../../src/church-choice.ts';
import { isUuid } from '../../src/ids.ts';
import { isRecord } from '../../src/schema.ts';
import type { AccountSession } from '../lib/account-store.ts';
import type { StoreBoot } from '../lib/select-store.ts';
import { resumeConversation } from '../lib/conversation.ts';
import { intakeTree } from '../lib/intake-tree.ts';
import { BRIEF_FIELDS, BRIEF_LABELS, initialVisit, type BriefField, type BriefLine, type Visit } from '../lib/visit.ts';
import { envValue, readLocalApi } from './local-api.ts';

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

export async function readStoreBoot(): Promise<StoreBoot> {
  if (envValue('READY_VISIT_STORE') !== 'account') return { mode: 'demo' };
  const local = readLocalApi();
  if (local === null) throw new Error('account boot needs a loopback API and key');
  const sessions = parseSessions(envValue('READY_ACCOUNT_SESSIONS'));
  const parent = sessions.find((session) => session.role === 'parent');
  if (parent === undefined) throw new Error('account boot needs a parent session');
  const memberships = await loadMemberships(local.apiUrl, local.anonKey, parent);
  const choice = chooseChurch(memberships, envValue('READY_ORGANIZATION_ID') ?? null);
  if (choice.status !== 'chosen') throw new Error('account boot needs one chosen church');
  const childId = await loadChild(local.apiUrl, local.anonKey, parent, choice.organizationId);
  const scope = { organizationId: choice.organizationId, childId };
  const initial = await loadVisit(local.apiUrl, local.anonKey, sessions, scope.organizationId, scope.childId);
  return { mode: 'account', sessions, scope, initial };
}

function parseSessions(value: string | undefined): readonly AccountSession[] {
  if (value === undefined) throw new Error('account boot needs sessions');
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new Error('account boot needs sessions');
  }
  if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('account boot needs sessions');
  return parsed.map(parseSession);
}

function parseSession(value: unknown): AccountSession {
  if (!isRecord(value) || typeof value.userId !== 'string' || !isUuid(value.userId)) {
    throw new Error('account boot needs sessions');
  }
  if (typeof value.accessToken !== 'string' || value.accessToken.length === 0) {
    throw new Error('account boot needs a token');
  }
  if (value.role !== 'parent' && value.role !== 'volunteer' && value.role !== 'leader') {
    throw new Error('account boot needs sessions');
  }
  return { userId: value.userId, accessToken: value.accessToken, role: value.role };
}

async function loadMemberships(apiUrl: string, anonKey: string, session: AccountSession): Promise<ChurchMembership[]> {
  const rows = await getRows(
    apiUrl,
    anonKey,
    session.accessToken,
    `/rest/v1/memberships?select=organization_id,role&user_id=eq.${session.userId}`,
  );
  const memberships: ChurchMembership[] = [];
  for (const row of rows) {
    if (typeof row.organization_id !== 'string' || !isUuid(row.organization_id)) continue;
    if (row.role !== 'parent' && row.role !== 'volunteer' && row.role !== 'leader') continue;
    memberships.push({ organizationId: row.organization_id, role: row.role });
  }
  return memberships;
}

async function loadChild(
  apiUrl: string,
  anonKey: string,
  session: AccountSession,
  organizationId: string,
): Promise<string> {
  const rows = await getRows(
    apiUrl,
    anonKey,
    session.accessToken,
    `/rest/v1/children?select=id&organization_id=eq.${organizationId}&parent_user_id=eq.${session.userId}`,
  );
  if (rows.length !== 1) throw new Error('account boot needs one child');
  const row = rows[0];
  if (row === undefined || typeof row.id !== 'string' || !isUuid(row.id)) {
    throw new Error('account boot needs one child');
  }
  return row.id;
}

async function loadVisit(
  apiUrl: string,
  anonKey: string,
  sessions: readonly AccountSession[],
  organizationId: string,
  childId: string,
): Promise<Visit> {
  let visit = initialVisit();
  const parent = sessions.find((session) => session.role === 'parent');
  const volunteer = sessions.find((session) => session.role === 'volunteer');
  const leader = sessions.find((session) => session.role === 'leader');
  if (parent !== undefined) {
    visit = await applyParent(visit, apiUrl, anonKey, parent.accessToken, organizationId, childId);
  }
  if (volunteer !== undefined) {
    visit = await applyNotes(visit, apiUrl, anonKey, volunteer, childId);
  }
  if (leader !== undefined) {
    visit = await applyLeader(visit, apiUrl, anonKey, leader.accessToken, organizationId, childId);
  }
  return visit;
}

async function applyParent(
  visit: Visit,
  apiUrl: string,
  anonKey: string,
  token: string,
  organizationId: string,
  childId: string,
): Promise<Visit> {
  const answers = await oneRow(
    apiUrl,
    anonKey,
    token,
    `/rest/v1/intake_answers?select=answers&organization_id=eq.${organizationId}&child_id=eq.${childId}`,
  );
  const brief = await oneRow(
    apiUrl,
    anonKey,
    token,
    `/rest/v1/parent_briefs?select=*&child_id=eq.${childId}`,
  );
  const publication = await oneRow(
    apiUrl,
    anonKey,
    token,
    `/rest/v1/brief_publications?select=lines&organization_id=eq.${organizationId}&child_id=eq.${childId}`,
  );
  let next = visit;
  if (answers !== null) {
    next = { ...next, conversation: resumeConversation(intakeTree, parseAnswers(answers.answers)) };
  }
  if (brief !== null) next = applyBrief(next, brief);
  if (publication !== null) {
    next = {
      ...next,
      brief: { phase: 'approved', lines: parseLines(publication.lines) },
      conversation: { ...next.conversation, talk: { mode: 'approved', source: { type: 'intake' } } },
    };
  }
  return next;
}

async function applyNotes(
  visit: Visit,
  apiUrl: string,
  anonKey: string,
  session: AccountSession,
  childId: string,
): Promise<Visit> {
  const row = await oneRow(
    apiUrl,
    anonKey,
    session.accessToken,
    `/rest/v1/volunteer_notes?select=body&user_id=eq.${session.userId}&child_id=eq.${childId}`,
  );
  if (row === null) return visit;
  if (typeof row.body !== 'string') throw new Error('account boot could not read notes');
  return { ...visit, notes: row.body };
}

async function applyLeader(
  visit: Visit,
  apiUrl: string,
  anonKey: string,
  token: string,
  organizationId: string,
  childId: string,
): Promise<Visit> {
  const church = await oneRow(
    apiUrl,
    anonKey,
    token,
    `/rest/v1/church_setup?select=name,service,room,leader_label,ages,plan&organization_id=eq.${organizationId}`,
  );
  const lesson = await oneRow(
    apiUrl,
    anonKey,
    token,
    `/rest/v1/lessons?select=source,summary,steps,status&organization_id=eq.${organizationId}`,
  );
  const update = await oneRow(
    apiUrl,
    anonKey,
    token,
    `/rest/v1/sunday_updates?select=body,status&child_id=eq.${childId}`,
  );
  let next = visit;
  if (church !== null) next = { ...next, church: parseChurch(church) };
  if (lesson !== null && lesson.status === 'approved') next = applyLesson(next, lesson);
  if (update !== null && update.status === 'approved' && typeof update.body === 'string') {
    next = { ...next, update: { phase: 'approved', value: { body: update.body } } };
  }
  return next;
}

function applyBrief(visit: Visit, row: Record<string, unknown>): Visit {
  const card = { ...visit.card };
  const visibility = { ...visit.visibility };
  for (const field of BRIEF_FIELDS) {
    const column = TEXT_COLUMN[field];
    const text = row[column];
    const shown = row[`show_${column}`];
    if (typeof text !== 'string' || typeof shown !== 'boolean') throw new Error('account boot could not read the brief');
    card[field] = text;
    visibility[field] = shown;
  }
  if (typeof row.card_touched !== 'boolean') throw new Error('account boot could not read the brief');
  return { ...visit, card, visibility, cardTouched: row.card_touched };
}

function applyLesson(visit: Visit, row: Record<string, unknown>): Visit {
  if (typeof row.source !== 'string' || typeof row.summary !== 'string' || !Array.isArray(row.steps)) {
    throw new Error('account boot could not read the lesson');
  }
  const steps: string[] = [];
  for (const step of row.steps) {
    if (typeof step !== 'string') throw new Error('account boot could not read the lesson');
    steps.push(step);
  }
  return {
    ...visit,
    lessonSource: row.source,
    lesson: { phase: 'approved', value: { summary: row.summary, steps } },
  };
}

function parseChurch(row: Record<string, unknown>): Visit['church'] {
  if (
    typeof row.name !== 'string' ||
    typeof row.service !== 'string' ||
    typeof row.room !== 'string' ||
    typeof row.leader_label !== 'string' ||
    typeof row.ages !== 'string' ||
    typeof row.plan !== 'string'
  ) {
    throw new Error('account boot could not read the church');
  }
  return {
    name: row.name,
    service: row.service,
    room: row.room,
    leader: row.leader_label,
    ages: row.ages,
    plan: row.plan,
  };
}

function parseAnswers(value: unknown): Visit['conversation']['answers'] {
  if (!isRecord(value)) throw new Error('account boot could not read answers');
  const answers: Record<string, { kind: 'answered'; text: string }> = {};
  for (const [key, answer] of Object.entries(value)) {
    if (!isRecord(answer) || answer.kind !== 'answered' || typeof answer.text !== 'string') {
      throw new Error('account boot could not read answers');
    }
    answers[key] = { kind: 'answered', text: answer.text };
  }
  return answers;
}

function parseLines(value: unknown): BriefLine[] {
  if (!Array.isArray(value)) throw new Error('account boot could not read the publication');
  const lines: BriefLine[] = [];
  for (const line of value) {
    if (!isRecord(line) || typeof line.text !== 'string' || !isBriefField(line.field)) {
      throw new Error('account boot could not read the publication');
    }
    if (line.field === 'medical') continue;
    lines.push({ field: line.field, label: BRIEF_LABELS[line.field], text: line.text });
  }
  return lines;
}

async function oneRow(apiUrl: string, anonKey: string, token: string, path: string): Promise<Record<string, unknown> | null> {
  const rows = await getRows(apiUrl, anonKey, token, path);
  if (rows.length === 0) return null;
  if (rows.length !== 1) throw new Error('account boot could not read rows');
  return rows[0] ?? null;
}

async function getRows(apiUrl: string, anonKey: string, token: string, path: string): Promise<Record<string, unknown>[]> {
  const response = await fetch(`${apiUrl}${path}`, {
    headers: {
      accept: 'application/json',
      apikey: anonKey,
      authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) throw new Error('account boot could not read rows');
  const body = (await response.json()) as unknown;
  if (!Array.isArray(body)) throw new Error('account boot could not read rows');
  const rows: Record<string, unknown>[] = [];
  for (const row of body) {
    if (!isRecord(row)) throw new Error('account boot could not read rows');
    rows.push(row);
  }
  return rows;
}

function isBriefField(value: unknown): value is BriefField {
  return typeof value === 'string' && BRIEF_FIELDS.some((field) => field === value);
}
