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
  | { readonly mode: 'ask'; readonly nodeId: string }
  | { readonly mode: 'brief'; readonly source: BriefSource }
  | { readonly mode: 'fix'; readonly sectionId: SectionId; readonly nodeId: string }
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
      readonly priorAnswer: string | null;
      readonly followAnswer: string | null;
      readonly fixing: boolean;
      readonly sectionTitle: string;
      readonly sections: readonly { readonly id: SectionId; readonly label: string }[];
    }
  | {
      readonly kind: 'brief';
      readonly brief: ParentBrief;
      readonly actions: 'intake' | 'example';
    }
  | { readonly kind: 'approved'; readonly name: string; readonly headline: string };

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
        actions: conversation.talk.source.type === 'example' ? 'example' : 'intake',
      };
    case 'approved':
      return approvedView(tree, conversation.talk.source);
    default: {
      const leftover: never = conversation.talk;
      return leftover;
    }
  }
}

export function parentBrief(tree: IntakeTree, conversation: Conversation): ParentBrief {
  const source = briefSource(conversation);
  if (source?.type === 'example') return exampleParentBrief(source.id);
  return {
    name: tree.child.preferredName,
    ageYears: tree.child.ageYears,
    summary: sectionProse(tree, conversation, 'about'),
    photos: [tree.child.preferredName, 'His headphones', 'Quiet corner'],
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
  return {
    post: {
      preferredName: tree.child.preferredName,
      ageYears: tree.child.ageYears,
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
  return { ...conversation, talk: { mode: 'brief', source: conversation.talk.source } };
}

function reopenQuestions(tree: IntakeTree, conversation: Conversation): Conversation {
  if (conversation.talk.mode !== 'brief' || conversation.talk.source.type !== 'intake') return conversation;
  const first = tree.sections[0];
  if (first === undefined) return conversation;
  return { ...conversation, talk: { mode: 'ask', nodeId: first.nodeId } };
}

function chooseSection(tree: IntakeTree, conversation: Conversation, sectionId: string): Conversation {
  if (conversation.talk.mode === 'brief' && conversation.talk.source.type !== 'intake') return conversation;
  if (conversation.talk.mode !== 'brief' && conversation.talk.mode !== 'fix') return conversation;
  if (!isSectionId(sectionId)) return conversation;
  const section = sectionById(tree, sectionId);
  if (section === undefined) return conversation;
  return { ...conversation, talk: { mode: 'fix', sectionId: section.id, nodeId: section.nodeId } };
}

function commitAnswer(tree: IntakeTree, conversation: Conversation, text: string): Conversation {
  const trimmed = text.trim();
  if (trimmed.length === 0) return conversation;
  if (conversation.talk.mode !== 'ask' && conversation.talk.mode !== 'fix') return conversation;
  const node = nodeById(tree, conversation.talk.nodeId);
  if (node === undefined) return conversation;
  const section = sectionById(tree, node.sectionId);
  if (section === undefined) return conversation;
  const followId = openedFollow(tree, node, trimmed);
  const answers = dropClosedFollow({ ...conversation.answers, [node.id]: { kind: 'answered', text: trimmed } }, node, followId);
  if (followId !== null) {
    if (conversation.talk.mode === 'fix') {
      return { ...conversation, talk: { mode: 'fix', sectionId: conversation.talk.sectionId, nodeId: followId }, answers };
    }
    return { ...conversation, talk: { mode: 'ask', nodeId: followId }, answers };
  }
  if (conversation.talk.mode === 'fix') {
    return {
      talk: { mode: 'brief', source: { type: 'intake' } },
      answers,
      updated: appendUpdated(conversation.updated, conversation.talk.sectionId),
    };
  }
  const next = nextSection(tree, section.id);
  if (next === undefined) return { talk: { mode: 'brief', source: { type: 'intake' } }, answers, updated: conversation.updated };
  return { ...conversation, talk: { mode: 'ask', nodeId: next.nodeId }, answers };
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
  return {
    kind: 'question',
    nodeId: node.id,
    prompt: fill(node.prompt, tree, conversation, node.id),
    progress: `Section ${index} of ${tree.sections.length} · ${section.title}`,
    mark: fixing ? `${section.title} · FIX` : `${section.title} · REQUIRED`,
    index,
    total: tree.sections.length,
    placeholder: node.placeholder,
    chips: node.chips ?? [],
    closeChip: node.closeChip ?? null,
    exactChip: node.follow?.when === 'unless' ? node.follow.text : null,
    priorAnswer: answerText(conversation, node.id),
    followAnswer: node.follow === undefined ? null : answerText(conversation, node.follow.nodeId),
    fixing,
    sectionTitle: section.title,
    sections: tree.sections.flatMap((item) =>
      item.id === 'about' ? [] : [{ id: item.id, label: item.reviewLabel }],
    ),
  };
}

function approvedView(tree: IntakeTree, source: BriefSource): AskView {
  const name = source.type === 'example' ? exampleBrief(source.id).name : tree.child.preferredName;
  return { kind: 'approved', name, headline: `${name} is ready for Sunday` };
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

function openedFollow(tree: IntakeTree, node: IntakeNode, text: string): string | null {
  const follow = node.follow;
  if (follow === undefined) return null;
  if (tree.nodes.some((other) => other.follow?.nodeId === node.id)) return null;
  if (!followOpens(follow, text)) return null;
  return follow.nodeId;
}

function followOpens(follow: Follow, text: string): boolean {
  switch (follow.when) {
    case 'short':
      return text.trim().length <= follow.maxChars;
    case 'unless':
      return text.trim() !== follow.text;
    default: {
      const leftover: never = follow;
      return leftover;
    }
  }
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
    if (node.sectionId !== sectionId) continue;
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
  return template.replaceAll('{parent}', tree.parentName).replaceAll('{prior}', priorFor(tree, conversation, nodeId));
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
