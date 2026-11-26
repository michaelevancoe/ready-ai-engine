import { spaceSentences } from './desk.ts';
import { exampleBrief, exampleList, type ExampleId } from './example-briefs.ts';
import {
  isSectionId,
  type Follow,
  type IntakeNode,
  type IntakeSection,
  type IntakeTree,
  type SectionId,
  type Write,
} from './intake-tree.ts';

export type { ExampleId, SectionId };

export type BriefSource = { readonly type: 'intake' } | { readonly type: 'example'; readonly id: ExampleId };

export type Talk =
  | { readonly mode: 'start' }
  | { readonly mode: 'ask'; readonly nodeId: string; readonly notice?: string }
  | { readonly mode: 'brief'; readonly source: BriefSource; readonly review: 'draft' | 'approved' }
  | { readonly mode: 'fix'; readonly sectionId: SectionId; readonly nodeId: string; readonly notice?: string }
  | { readonly mode: 'approved'; readonly source: BriefSource };

export type NodeAnswer = { readonly kind: 'answered'; readonly text: string };

export interface Conversation {
  readonly talk: Talk;
  readonly answers: Readonly<Record<string, NodeAnswer>>;
  readonly updated: readonly SectionId[];
}

export type ConversationEvent =
  | { readonly type: 'beginIntake' }
  | { readonly type: 'openExample'; readonly id: ExampleId }
  | { readonly type: 'leaveExample' }
  | { readonly type: 'answer'; readonly text: string }
  | { readonly type: 'chooseSection'; readonly sectionId: string }
  | { readonly type: 'approve' }
  | { readonly type: 'viewBrief' }
  | { readonly type: 'reviseBrief' }
  | { readonly type: 'backToApproved' }
  | { readonly type: 'reopenQuestions' };

export interface BriefCard {
  readonly sectionId: SectionId;
  readonly label: string;
  readonly text: string;
  readonly updated: boolean;
}

export interface ParentBrief {
  readonly name: string;
  readonly ageYears: number;
  readonly summary: string;
  readonly photos: readonly [string, string, string];
  readonly cards: readonly BriefCard[];
}

export type AskView =
  | {
      readonly kind: 'start';
      readonly examples: readonly {
        readonly id: ExampleId;
        readonly name: string;
        readonly ageYears: number;
        readonly blurb: string;
      }[];
    }
  | {
      readonly kind: 'question';
      readonly nodeId: string;
      readonly prompt: string;
      readonly progress: string;
      readonly mark: string;
      readonly index: number;
      readonly total: number;
      readonly placeholder: string;
      readonly chips: readonly string[];
      readonly closeChip: string | null;
      readonly exactChip: string | null;
      readonly chipsAlone: boolean;
      readonly notice: string | null;
      readonly priorAnswer: string | null;
      readonly followAnswer: string | null;
      readonly fixing: boolean;
      readonly sectionTitle: string;
      readonly sections: readonly { readonly id: SectionId; readonly label: string }[];
    }
  | {
      readonly kind: 'brief';
      readonly brief: ParentBrief;
      readonly actions: 'draft' | 'readonly';
      readonly canLeave: boolean;
    }
  | {
      readonly kind: 'approved';
      readonly name: string;
      readonly headline: string;
      readonly canRevise: boolean;
      readonly canLeave: boolean;
    };

export interface IntakePost {
  readonly preferredName: string;
  readonly ageYears: number;
  readonly sensoryNotes: string;
  readonly supportNeeds: string;
  readonly whatHelps: string;
  readonly whatToAvoid: string;
}

export interface ProjectedCard {
  readonly loves: string;
  readonly overwhelms: string;
  readonly whatHelps: string;
  readonly communication: string;
  readonly sensory: string;
  readonly toileting: string;
  readonly allergies: string;
  readonly calming: string;
  readonly medical: string;
}

export interface Projection {
  readonly post: IntakePost;
  readonly card: ProjectedCard;
}

export function initialConversation(): Conversation {
  return { talk: { mode: 'start' }, answers: {}, updated: [] };
}

export function resumeConversation(tree: IntakeTree, answers: Conversation['answers']): Conversation {
  if (Object.keys(answers).length === 0) return initialConversation();
  let cursor = reduceConversation(tree, { talk: { mode: 'start' }, answers, updated: [] }, { type: 'beginIntake' });
  const seen = new Set<string>();
  while (cursor.talk.mode === 'ask' || cursor.talk.mode === 'fix') {
    if (seen.has(cursor.talk.nodeId)) break;
    seen.add(cursor.talk.nodeId);
    const saved = answers[cursor.talk.nodeId];
    if (saved === undefined) break;
    const next = reduceConversation(tree, cursor, { type: 'answer', text: saved.text });
    if (next === cursor) break;
    cursor = next;
  }
  return { ...cursor, answers };
}

export function reduceConversation(tree: IntakeTree, conversation: Conversation, event: ConversationEvent): Conversation {
  switch (event.type) {
    case 'beginIntake':
      return beginIntake(tree, conversation);
    case 'openExample':
      return openExample(conversation, event.id);
    case 'leaveExample':
      return leaveExample(conversation);
    case 'answer':
      return commitAnswer(tree, conversation, event.text);
    case 'chooseSection':
      return chooseSection(tree, conversation, event.sectionId);
    case 'approve':
      return approve(conversation);
    case 'viewBrief':
      return viewBrief(conversation);
    case 'reviseBrief':
      return reviseBrief(conversation);
    case 'backToApproved':
      return backToApproved(conversation);
    case 'reopenQuestions':
      return reopenQuestions(tree, conversation);
    default: {
      const leftover: never = event;
      return leftover;
    }
  }
}

export function presentAsk(tree: IntakeTree, conversation: Conversation): AskView {
  switch (conversation.talk.mode) {
    case 'start':
      return startView();
    case 'ask':
    case 'fix':
      return questionView(tree, conversation);
    case 'brief':
      return {
        kind: 'brief',
        brief: parentBrief(tree, conversation),
        actions: briefActions(conversation.talk),
        canLeave: conversation.talk.source.type === 'example',
      };
    case 'approved':
      return approvedView(conversation);
    default: {
      const leftover: never = conversation.talk;
      return leftover;
    }
  }
}

export function parentBrief(tree: IntakeTree, conversation: Conversation): ParentBrief {
  const source = briefSource(conversation);
  if (source?.type === 'example') return exampleParentBrief(source.id);
  const child = intakeChild(conversation);
  return {
    name: child.preferredName,
    ageYears: child.ageYears,
    summary: sectionProse(tree, conversation, 'about'),
    photos: [child.preferredName, 'Headphones', 'Quiet corner'],
    cards: tree.sections.flatMap((section) => {
      if (section.id === 'about') return [];
      return [
        {
          sectionId: section.id,
          label: section.reviewLabel,
          text: sectionProse(tree, conversation, section.id),
          updated: conversation.updated.includes(section.id),
        },
      ];
    }),
  };
}

export function project(tree: IntakeTree, conversation: Conversation): Projection {
  const child = intakeChild(conversation);
  return {
    post: {
      preferredName: child.preferredName,
      ageYears: child.ageYears,
      sensoryNotes: joined(tree, conversation, (write) => write.target === 'post' && write.key === 'sensoryNotes'),
      supportNeeds: joined(tree, conversation, (write) => write.target === 'post' && write.key === 'supportNeeds'),
      whatHelps: joined(tree, conversation, (write) => write.target === 'post' && write.key === 'whatHelps'),
      whatToAvoid: joined(tree, conversation, (write) => write.target === 'post' && write.key === 'whatToAvoid'),
    },
    card: {
      loves: joined(tree, conversation, (write) => write.target === 'card' && write.key === 'loves'),
      overwhelms: joined(tree, conversation, (write) => write.target === 'card' && write.key === 'overwhelms'),
      whatHelps: joined(tree, conversation, (write) => write.target === 'card' && write.key === 'whatHelps'),
      communication: joined(tree, conversation, (write) => write.target === 'card' && write.key === 'communication'),
      sensory: joined(tree, conversation, (write) => write.target === 'card' && write.key === 'sensory'),
      toileting: joined(tree, conversation, (write) => write.target === 'card' && write.key === 'toileting'),
      allergies: joined(tree, conversation, (write) => write.target === 'card' && write.key === 'allergies'),
      calming: joined(tree, conversation, (write) => write.target === 'card' && write.key === 'calming'),
      medical: '',
    },
  };
}

export const UNANSWERED_CHILD = { preferredName: 'Rowan', ageYears: 7 } as const;

const NAME_NOTICE = 'Use 1 to 40 letters, spaces, hyphens, or apostrophes.';
const AGE_NOTICE = 'Use a whole number from 0 to 18.';
const NAME_PATTERN = /^(?=.*\p{L})[\p{L} '\u2019-]+$/u;

export function answeredChild(conversation: Conversation): { preferredName: string; ageYears: number } | null {
  const name = conversation.answers.name;
  const age = conversation.answers.age;
  if (name === undefined || age === undefined) return null;
  const preferredName = checkedName(name.text);
  const ageYears = checkedAge(age.text);
  if (preferredName === null || ageYears === null) return null;
  return { preferredName, ageYears };
}

export function answerNeedsAck(tree: IntakeTree, nodeId: string): boolean {
  const node = nodeById(tree, nodeId);
  return node?.check !== 'name' && node?.check !== 'age';
}

function intakeChild(conversation: Conversation): { preferredName: string; ageYears: number } {
  return answeredChild(conversation) ?? UNANSWERED_CHILD;
}

function invalidNotice(check: 'name' | 'age', text: string): string | null {
  if (check === 'name') return checkedName(text) === null ? NAME_NOTICE : null;
  return checkedAge(text) === null ? AGE_NOTICE : null;
}

function checkedName(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.length < 1 || trimmed.length > 40) return null;
  if (!NAME_PATTERN.test(trimmed)) return null;
  return trimmed;
}

function checkedAge(text: string): number | null {
  const trimmed = text.trim();
  if (!/^(?:0|[1-9]\d*)$/u.test(trimmed)) return null;
  const age = Number(trimmed);
  if (age > 18) return null;
  return age;
}

function beginIntake(tree: IntakeTree, conversation: Conversation): Conversation {
  if (conversation.talk.mode !== 'start') return conversation;
  const first = tree.sections[0];
  if (first === undefined) return conversation;
  return { ...conversation, talk: { mode: 'ask', nodeId: first.nodeId } };
}

function openExample(conversation: Conversation, id: ExampleId): Conversation {
  if (conversation.talk.mode !== 'start') return conversation;
  return { ...conversation, talk: { mode: 'approved', source: { type: 'example', id } } };
}

function leaveExample(conversation: Conversation): Conversation {
  switch (conversation.talk.mode) {
    case 'brief':
    case 'approved':
      if (conversation.talk.source.type !== 'example') return conversation;
      return { ...conversation, talk: { mode: 'start' } };
    case 'start':
    case 'ask':
    case 'fix':
      return conversation;
    default: {
      const leftover: never = conversation.talk;
      return leftover;
    }
  }
}

function approve(conversation: Conversation): Conversation {
  if (conversation.talk.mode !== 'brief') return conversation;
  return { ...conversation, talk: { mode: 'approved', source: conversation.talk.source } };
}

function viewBrief(conversation: Conversation): Conversation {
  if (conversation.talk.mode !== 'approved') return conversation;
  return { ...conversation, talk: { mode: 'brief', source: conversation.talk.source, review: 'approved' } };
}

function reviseBrief(conversation: Conversation): Conversation {
  if (conversation.talk.mode !== 'approved' || conversation.talk.source.type !== 'intake') return conversation;
  return { ...conversation, talk: { mode: 'brief', source: { type: 'intake' }, review: 'draft' } };
}

function backToApproved(conversation: Conversation): Conversation {
  if (conversation.talk.mode !== 'brief') return conversation;
  return { ...conversation, talk: { mode: 'approved', source: conversation.talk.source } };
}

function reopenQuestions(tree: IntakeTree, conversation: Conversation): Conversation {
  if (conversation.talk.mode !== 'brief' || conversation.talk.review !== 'draft') return conversation;
  if (conversation.talk.source.type !== 'intake') return conversation;
  const first = tree.sections[0];
  if (first === undefined) return conversation;
  return { ...conversation, talk: { mode: 'ask', nodeId: first.nodeId } };
}

function chooseSection(tree: IntakeTree, conversation: Conversation, sectionId: string): Conversation {
  if (conversation.talk.mode === 'brief' && (conversation.talk.source.type !== 'intake' || conversation.talk.review !== 'draft')) {
    return conversation;
  }
  if (conversation.talk.mode !== 'brief' && conversation.talk.mode !== 'fix') return conversation;
  if (!isSectionId(sectionId)) return conversation;
  const section = sectionById(tree, sectionId);
  if (section === undefined) return conversation;
  return { ...conversation, talk: { mode: 'fix', sectionId: section.id, nodeId: section.nodeId } };
}

function commitAnswer(tree: IntakeTree, conversation: Conversation, text: string): Conversation {
  if (conversation.talk.mode !== 'ask' && conversation.talk.mode !== 'fix') return conversation;
  const node = nodeById(tree, conversation.talk.nodeId);
  if (node === undefined) return conversation;
  const section = sectionById(tree, node.sectionId);
  if (section === undefined) return conversation;
  const trimmed = text.trim();
  if (node.check !== undefined) {
    const notice = invalidNotice(node.check, trimmed);
    if (notice !== null) return { ...conversation, talk: { ...conversation.talk, notice } };
  } else if (trimmed.length === 0) {
    return conversation;
  }
  const followId = openedFollow(tree, node, trimmed);
  const answers = dropClosedFollow({ ...conversation.answers, [node.id]: { kind: 'answered', text: trimmed } }, node, followId);
  if (followId !== null) {
    if (conversation.talk.mode === 'fix') {
      return { ...conversation, talk: { mode: 'fix', sectionId: conversation.talk.sectionId, nodeId: followId }, answers };
    }
    return { ...conversation, talk: { mode: 'ask', nodeId: followId }, answers };
  }
  if (isFollowTarget(tree, node.id)) return finishSection(tree, conversation, section, answers);
  const nextId = nextInSection(tree, node);
  if (nextId !== null) {
    if (conversation.talk.mode === 'fix') {
      return { ...conversation, talk: { mode: 'fix', sectionId: conversation.talk.sectionId, nodeId: nextId }, answers };
    }
    return { ...conversation, talk: { mode: 'ask', nodeId: nextId }, answers };
  }
  return finishSection(tree, conversation, section, answers);
}

function startView(): AskView {
  return {
    kind: 'start',
    examples: exampleList().map((example) => ({
      id: example.id,
      name: example.name,
      ageYears: example.ageYears,
      blurb: example.blurb,
    })),
  };
}

function questionView(tree: IntakeTree, conversation: Conversation): AskView {
  if (conversation.talk.mode !== 'ask' && conversation.talk.mode !== 'fix') return startView();
  const node = nodeById(tree, conversation.talk.nodeId);
  const section = node === undefined ? undefined : sectionById(tree, node.sectionId);
  if (node === undefined || section === undefined) return startView();
  const index = tree.sections.findIndex((item) => item.id === section.id) + 1;
  const fixing = conversation.talk.mode === 'fix';
  const mark = isFollowTarget(tree, node.id)
    ? `${section.title.toUpperCase()} · ONE MORE`
    : fixing
      ? `${section.title} · FIX`
      : `${section.title} · REQUIRED`;
  return {
    kind: 'question',
    nodeId: node.id,
    prompt: fill(node.prompt, tree, conversation, node.id),
    progress: `Section ${index} of ${tree.sections.length} · ${section.title}`,
    mark,
    index,
    total: tree.sections.length,
    placeholder: node.placeholder,
    chips: node.chips ?? [],
    closeChip: node.closeChip ?? null,
    exactChip: node.chips?.includes('No known allergies') === true ? 'No known allergies' : null,
    chipsAlone: node.check === 'age',
    notice: conversation.talk.notice ?? null,
    priorAnswer: answerText(conversation, node.id),
    followAnswer: node.follow === undefined ? null : answerText(conversation, node.follow.nodeId),
    fixing,
    sectionTitle: section.title,
    sections: tree.sections.flatMap((item) =>
      item.id === 'about' ? [] : [{ id: item.id, label: item.reviewLabel }],
    ),
  };
}

function approvedView(conversation: Conversation): AskView {
  if (conversation.talk.mode !== 'approved') return startView();
  const source = conversation.talk.source;
  const name = source.type === 'example' ? exampleBrief(source.id).name : intakeChild(conversation).preferredName;
  return {
    kind: 'approved',
    name,
    headline: `${name} is ready for Sunday`,
    canRevise: source.type === 'intake',
    canLeave: source.type === 'example',
  };
}

function briefActions(talk: Extract<Talk, { mode: 'brief' }>): 'draft' | 'readonly' {
  if (talk.source.type === 'example' || talk.review === 'approved') return 'readonly';
  return 'draft';
}

function exampleParentBrief(id: ExampleId): ParentBrief {
  const example = exampleBrief(id);
  return {
    name: example.name,
    ageYears: example.ageYears,
    summary: example.summary,
    photos: example.photos,
    cards: example.cards.map((card) => ({ ...card, updated: false })),
  };
}

function briefSource(conversation: Conversation): BriefSource | null {
  switch (conversation.talk.mode) {
    case 'brief':
    case 'approved':
      return conversation.talk.source;
    case 'start':
    case 'ask':
    case 'fix':
      return null;
    default: {
      const leftover: never = conversation.talk;
      return leftover;
    }
  }
}

function appendUpdated(updated: readonly SectionId[], id: SectionId): readonly SectionId[] {
  if (updated.includes(id)) return updated;
  return [...updated, id];
}

function nextSection(tree: IntakeTree, sectionId: SectionId): IntakeSection | undefined {
  const index = tree.sections.findIndex((section) => section.id === sectionId);
  return tree.sections[index + 1];
}

function finishSection(
  tree: IntakeTree,
  conversation: Conversation,
  section: IntakeSection,
  answers: Conversation['answers'],
): Conversation {
  if (conversation.talk.mode === 'fix') {
    return {
      talk: { mode: 'brief', source: { type: 'intake' }, review: 'draft' },
      answers,
      updated: appendUpdated(conversation.updated, conversation.talk.sectionId),
    };
  }
  const next = nextSection(tree, section.id);
  if (next === undefined) {
    return { talk: { mode: 'brief', source: { type: 'intake' }, review: 'draft' }, answers, updated: conversation.updated };
  }
  return { ...conversation, talk: { mode: 'ask', nodeId: next.nodeId }, answers };
}

function nextInSection(tree: IntakeTree, node: IntakeNode): string | null {
  const targets = followTargets(tree);
  const start = tree.nodes.findIndex((item) => item.id === node.id);
  for (let index = start + 1; index < tree.nodes.length; index += 1) {
    const candidate = tree.nodes[index];
    if (candidate === undefined) return null;
    if (targets.has(candidate.id)) continue;
    if (candidate.sectionId !== node.sectionId) return null;
    return candidate.id;
  }
  return null;
}

function isFollowTarget(tree: IntakeTree, nodeId: string): boolean {
  return followTargets(tree).has(nodeId);
}

function followTargets(tree: IntakeTree): Set<string> {
  return new Set(tree.nodes.flatMap((node) => (node.follow === undefined ? [] : [node.follow.nodeId])));
}

function openedFollow(tree: IntakeTree, node: IntakeNode, text: string): string | null {
  const follow = node.follow;
  if (follow === undefined) return null;
  if (tree.nodes.some((other) => other.follow?.nodeId === node.id)) return null;
  if (!followOpens(follow, text)) return null;
  return follow.nodeId;
}

const NONE_PHRASES = new Set([
  'no',
  'none',
  'nothing',
  'no allergies',
  'no known allergies',
  'not that we know',
  'nothing else',
]);

function followOpens(follow: Follow, text: string): boolean {
  switch (follow.when) {
    case 'short':
      return text.trim().length <= follow.maxChars;
    case 'allergy':
      return !NONE_PHRASES.has(normalizeAnswer(text));
    default: {
      const leftover: never = follow;
      return leftover;
    }
  }
}

function normalizeAnswer(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/gu, ' ').replace(/[.!?]+$/u, '');
}

function dropClosedFollow(
  answers: Readonly<Record<string, NodeAnswer>>,
  node: IntakeNode,
  followId: string | null,
): Readonly<Record<string, NodeAnswer>> {
  const followNodeId = node.follow?.nodeId;
  if (followNodeId === undefined || followId !== null || answers[followNodeId] === undefined) return answers;
  const next = { ...answers };
  delete next[followNodeId];
  return next;
}

function sectionProse(tree: IntakeTree, conversation: Conversation, sectionId: string): string {
  const parts: string[] = [];
  for (const node of tree.nodes) {
    if (node.sectionId !== sectionId || node.writes.length === 0) continue;
    const text = answerText(conversation, node.id);
    if (text === null) continue;
    parts.push(finishSentence(text));
  }
  return spaceSentences(parts.join(' '));
}

function joined(tree: IntakeTree, conversation: Conversation, match: (write: Write) => boolean): string {
  const parts: string[] = [];
  for (const section of tree.sections) {
    for (const node of tree.nodes) {
      if (node.sectionId !== section.id) continue;
      if (!node.writes.some(match)) continue;
      const text = answerText(conversation, node.id);
      if (text === null) continue;
      parts.push(finishSentence(text));
    }
  }
  return spaceSentences(parts.join(' '));
}

export function joinSpoken(typed: string, chip: string): string {
  const spoken = finishSentence(chip.trim());
  const lead = typed.trim();
  if (lead.length === 0) return spoken;
  if (/[.!?]$/u.test(lead)) return `${lead} ${spoken}`;
  return `${lead}. ${spoken}`;
}

function finishSentence(text: string): string {
  if (/[.!?]$/u.test(text)) return text;
  return `${text}.`;
}

function answerText(conversation: Conversation, nodeId: string): string | null {
  const answer = conversation.answers[nodeId];
  if (answer === undefined) return null;
  const text = answer.text.trim();
  return text.length === 0 ? null : text;
}

function fill(template: string, tree: IntakeTree, conversation: Conversation, nodeId: string): string {
  return template
    .replaceAll('{child}', spokenChild(conversation))
    .replaceAll('{parent}', tree.parentName)
    .replaceAll('{prior}', priorFor(tree, conversation, nodeId));
}

function spokenChild(conversation: Conversation): string {
  const answer = conversation.answers.name;
  if (answer === undefined) return 'your child';
  return checkedName(answer.text) ?? 'your child';
}

function priorFor(tree: IntakeTree, conversation: Conversation, nodeId: string): string {
  for (const node of tree.nodes) {
    if (node.follow?.nodeId !== nodeId) continue;
    const answer = conversation.answers[node.id];
    if (answer !== undefined) return answer.text.trim().replace(/[.!?]+$/u, '');
  }
  return '';
}

function nodeById(tree: IntakeTree, id: string): IntakeNode | undefined {
  return tree.nodes.find((node) => node.id === id);
}

function sectionById(tree: IntakeTree, id: string): IntakeSection | undefined {
  return tree.sections.find((section) => section.id === id);
}
