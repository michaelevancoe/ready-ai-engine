import { spaceSentences } from './desk.ts';
import type { IntakeNode, IntakeSection, IntakeTree, Write } from './intake-tree.ts';

export type NodeAnswer = { readonly kind: 'answered'; readonly text: string } | { readonly kind: 'skipped' };

export type Talk =
  | { readonly mode: 'intro' }
  | { readonly mode: 'ask'; readonly nodeId: string }
  | { readonly mode: 'medicalOffer' }
  | { readonly mode: 'reviewWait' }
  | { readonly mode: 'fixPick' }
  | { readonly mode: 'fixReason'; readonly sectionId: string }
  | {
      readonly mode: 'fixing';
      readonly sectionId: string;
      readonly nodeId: string;
      readonly reason: string;
      readonly done: boolean;
    };

export interface Conversation {
  readonly talk: Talk;
  readonly answers: Readonly<Record<string, NodeAnswer>>;
  readonly medical: 'unasked' | 'declined' | 'open';
}

export type ConversationEvent =
  | { readonly type: 'start' }
  | { readonly type: 'answer'; readonly text: string }
  | { readonly type: 'skip' }
  | { readonly type: 'declineMedical' }
  | { readonly type: 'acceptMedical' }
  | { readonly type: 'beginFix' }
  | { readonly type: 'chooseSection'; readonly sectionId: string }
  | { readonly type: 'giveReason'; readonly text: string }
  | { readonly type: 'leaveFix' }
  | { readonly type: 'finishFix' }
  | { readonly type: 'reopen' };

export interface AskLine {
  readonly from: 'ready' | 'parent';
  readonly text: string;
}

export interface FixingView {
  readonly label: string;
  readonly reason: string;
  readonly done: boolean;
}

export type AskView =
  | {
      readonly kind: 'question';
      readonly lines: readonly AskLine[];
      readonly progress: string;
      readonly countedIndex: number;
      readonly countedTotal: number;
      readonly onMedical: boolean;
      readonly placeholder: string;
      readonly chips: readonly string[];
      readonly closeChip: string | null;
      readonly skip: boolean;
      readonly leave: string;
      readonly fixing: FixingView | null;
    }
  | {
      readonly kind: 'offer';
      readonly lines: readonly AskLine[];
      readonly countedTotal: number;
      readonly leave: string;
      readonly skipLabel: string;
      readonly acceptLabel: string;
    }
  | {
      readonly kind: 'fixPick';
      readonly lines: readonly AskLine[];
      readonly chips: readonly { readonly id: string; readonly label: string }[];
      readonly leave: string;
    }
  | {
      readonly kind: 'fixReason';
      readonly lines: readonly AskLine[];
      readonly label: string;
      readonly placeholder: string;
      readonly leave: string;
    }
  | { readonly kind: 'review' };

export interface ProjectRow {
  readonly sectionId: string;
  readonly label: string;
  readonly state: 'drafted' | 'skipped';
  readonly text: string;
}

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
  readonly medical: string;
}

export interface Projection {
  readonly post: IntakePost;
  readonly card: ProjectedCard;
  readonly rows: readonly ProjectRow[];
}

export function initialConversation(): Conversation {
  return { talk: { mode: 'intro' }, answers: {}, medical: 'unasked' };
}

export function reduceConversation(tree: IntakeTree, conversation: Conversation, event: ConversationEvent): Conversation {
  switch (event.type) {
    case 'start':
      return begin(tree, conversation);
    case 'answer':
      return commit(tree, conversation, { kind: 'answered', text: event.text });
    case 'skip':
      return commit(tree, conversation, { kind: 'skipped' });
    case 'declineMedical':
      return decline(conversation);
    case 'acceptMedical':
      return accept(tree, conversation);
    case 'beginFix':
      return openFix(conversation);
    case 'chooseSection':
      return chooseSection(tree, conversation, event.sectionId);
    case 'giveReason':
      if (conversation.talk.mode !== 'fixReason') return conversation;
      return commit(tree, conversation, { kind: 'answered', text: event.text });
    case 'leaveFix':
      return leaveFix(conversation);
    case 'finishFix':
      return finishFix(conversation);
    case 'reopen':
      return reopen(tree, conversation);
    default: {
      const leftover: never = event;
      return leftover;
    }
  }
}

export function presentAsk(tree: IntakeTree, conversation: Conversation): AskView {
  switch (conversation.talk.mode) {
    case 'intro':
      return introView(tree);
    case 'ask':
    case 'fixing':
      return questionView(tree, conversation);
    case 'medicalOffer':
      return offerView(tree, conversation);
    case 'fixPick':
      return fixPickView(tree);
    case 'fixReason':
      return fixReasonView(tree, conversation);
    case 'reviewWait':
      return { kind: 'review' };
    default: {
      const leftover: never = conversation.talk;
      return leftover;
    }
  }
}

export function project(tree: IntakeTree, conversation: Conversation): Projection {
  const medical =
    conversation.medical === 'declined'
      ? ''
      : joined(tree, conversation, (write) => write.target === 'card' && write.key === 'medical');
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
      medical,
    },
    rows: tree.sections.map((section) => rowFor(tree, conversation, section)),
  };
}

function begin(tree: IntakeTree, conversation: Conversation): Conversation {
  if (conversation.talk.mode !== 'intro') return conversation;
  const first = countedSections(tree)[0];
  if (first === undefined) return conversation;
  return { ...conversation, talk: { mode: 'ask', nodeId: first.nodeId } };
}

function decline(conversation: Conversation): Conversation {
  if (conversation.talk.mode !== 'medicalOffer') return conversation;
  return { ...conversation, talk: { mode: 'reviewWait' }, medical: 'declined' };
}

function accept(tree: IntakeTree, conversation: Conversation): Conversation {
  if (conversation.talk.mode !== 'medicalOffer') return conversation;
  const section = tree.sections.find((item) => item.kind === 'medical');
  if (section === undefined) return conversation;
  return { ...conversation, talk: { mode: 'ask', nodeId: section.nodeId }, medical: 'open' };
}

function openFix(conversation: Conversation): Conversation {
  if (conversation.talk.mode !== 'reviewWait') return conversation;
  return { ...conversation, talk: { mode: 'fixPick' } };
}

function chooseSection(tree: IntakeTree, conversation: Conversation, sectionId: string): Conversation {
  if (conversation.talk.mode !== 'fixPick') return conversation;
  const section = sectionById(tree, sectionId);
  if (section === undefined) return conversation;
  return { ...conversation, talk: { mode: 'fixReason', sectionId: section.id } };
}

function beginFix(tree: IntakeTree, conversation: Conversation, sectionId: string, reason: string): Conversation {
  if (conversation.talk.mode !== 'fixReason' || conversation.talk.sectionId !== sectionId) return conversation;
  const trimmed = reason.trim();
  if (trimmed.length === 0) return conversation;
  const section = sectionById(tree, sectionId);
  if (section === undefined) return conversation;
  return {
    ...conversation,
    talk: { mode: 'fixing', sectionId: section.id, nodeId: section.nodeId, reason: trimmed, done: false },
  };
}

function leaveFix(conversation: Conversation): Conversation {
  switch (conversation.talk.mode) {
    case 'fixPick':
    case 'fixReason':
    case 'fixing':
      return { ...conversation, talk: { mode: 'reviewWait' } };
    case 'intro':
    case 'ask':
    case 'medicalOffer':
    case 'reviewWait':
      return conversation;
    default: {
      const leftover: never = conversation.talk;
      return leftover;
    }
  }
}

function finishFix(conversation: Conversation): Conversation {
  if (conversation.talk.mode !== 'fixing') return conversation;
  return { ...conversation, talk: { mode: 'reviewWait' } };
}

function reopen(tree: IntakeTree, conversation: Conversation): Conversation {
  if (conversation.talk.mode !== 'reviewWait') return conversation;
  const last = countedSections(tree).at(-1);
  if (last === undefined) return conversation;
  return { ...conversation, talk: { mode: 'ask', nodeId: last.nodeId } };
}

function commit(tree: IntakeTree, conversation: Conversation, answer: NodeAnswer): Conversation {
  if (answer.kind === 'answered' && answer.text.trim() === '') return conversation;
  if (conversation.talk.mode === 'fixReason') {
    if (answer.kind !== 'answered') return conversation;
    return beginFix(tree, conversation, conversation.talk.sectionId, answer.text);
  }
  const located = locate(tree, conversation);
  if (located === null || (conversation.talk.mode !== 'ask' && conversation.talk.mode !== 'fixing')) return conversation;
  const { node, section } = located;
  const stored = conversation.answers[node.id];
  const followTarget = tree.nodes.some((other) => other.follow?.nodeId === node.id);
  const committed =
    answer.kind === 'skipped' && followTarget && stored?.kind === 'answered' ? stored : answer;
  const followId = committed.kind === 'answered' ? openedFollow(tree, node, committed.text) : null;
  const answers = dropClosedFollow({ ...conversation.answers, [node.id]: committed }, node, followId);
  const medical = section.kind === 'medical' && answer.kind === 'answered' ? 'open' : conversation.medical;
  if (conversation.talk.mode === 'fixing') {
    if (followId !== null) {
      return {
        talk: {
          mode: 'fixing',
          sectionId: conversation.talk.sectionId,
          nodeId: followId,
          reason: conversation.talk.reason,
          done: false,
        },
        answers,
        medical,
      };
    }
    return { talk: { ...conversation.talk, done: true }, answers, medical };
  }
  if (section.kind === 'medical') return { talk: { mode: 'reviewWait' }, answers, medical };
  if (followId !== null) return { talk: { mode: 'ask', nodeId: followId }, answers, medical };
  return { talk: afterSection(tree, section.id, conversation.medical), answers, medical };
}

function introView(tree: IntakeTree): AskView {
  const first = countedSections(tree)[0];
  if (first === undefined) return { kind: 'review' };
  return questionView(tree, { talk: { mode: 'ask', nodeId: first.nodeId }, answers: {}, medical: 'unasked' });
}

function questionView(tree: IntakeTree, conversation: Conversation): AskView {
  if (conversation.talk.mode !== 'ask' && conversation.talk.mode !== 'fixing') return { kind: 'review' };
  const node = nodeById(tree, conversation.talk.nodeId);
  const section = node === undefined ? undefined : sectionById(tree, node.sectionId);
  if (node === undefined || section === undefined) return { kind: 'review' };
  const counted = countedSections(tree);
  const progress = progressFor(section, counted);
  const done = conversation.talk.mode === 'fixing' && conversation.talk.done;
  const first = counted[0];
  return {
    kind: 'question',
    lines: questionLines(tree, conversation, node, section),
    progress: progress.label,
    countedIndex: progress.index,
    countedTotal: counted.length,
    onMedical: section.kind === 'medical',
    placeholder: done ? '' : node.placeholder,
    chips: done ? [] : (node.chips ?? []),
    closeChip: done || node.closeChip === undefined ? null : node.closeChip,
    skip: !done,
    leave:
      conversation.talk.mode === 'fixing'
        ? tree.fixCopy.back
        : conversation.talk.mode === 'ask' && node.id === first?.nodeId
          ? 'Home'
          : 'Save & exit',
    fixing:
      conversation.talk.mode === 'fixing'
        ? { label: section.reviewLabel, reason: conversation.talk.reason, done: conversation.talk.done }
        : null,
  };
}

function offerView(tree: IntakeTree, conversation: Conversation): AskView {
  const lines: AskLine[] = [];
  const previous = lastAnswer(tree, conversation);
  if (previous !== null) lines.push({ from: 'parent', text: previous });
  lines.push({ from: 'ready', text: tree.medicalOffer.lead });
  lines.push({ from: 'ready', text: tree.medicalOffer.prompt });
  return {
    kind: 'offer',
    lines,
    countedTotal: countedSections(tree).length,
    leave: 'Save & exit',
    skipLabel: tree.medicalOffer.skipLabel,
    acceptLabel: tree.medicalOffer.acceptLabel,
  };
}

function fixPickView(tree: IntakeTree): AskView {
  return {
    kind: 'fixPick',
    lines: [{ from: 'ready', text: tree.fixCopy.pick }],
    chips: tree.sections.map((section) => ({ id: section.id, label: section.reviewLabel })),
    leave: tree.fixCopy.back,
  };
}

function fixReasonView(tree: IntakeTree, conversation: Conversation): AskView {
  if (conversation.talk.mode !== 'fixReason') return { kind: 'review' };
  const section = sectionById(tree, conversation.talk.sectionId);
  if (section === undefined) return { kind: 'review' };
  return {
    kind: 'fixReason',
    lines: [
      { from: 'ready', text: tree.fixCopy.pick },
      { from: 'parent', text: section.reviewLabel },
      { from: 'ready', text: tree.fixCopy.reason },
    ],
    label: section.reviewLabel,
    placeholder: tree.fixCopy.reasonPlaceholder,
    leave: tree.fixCopy.back,
  };
}

function questionLines(
  tree: IntakeTree,
  conversation: Conversation,
  node: IntakeNode,
  section: IntakeSection,
): AskLine[] {
  const lines: AskLine[] = [];
  const fixing = conversation.talk.mode === 'fixing' ? conversation.talk : null;
  if (fixing !== null) {
    lines.push({
      from: 'ready',
      text: `You said "${section.reviewLabel}" needs a fix: "${fixing.reason}" Let's revisit just that question.`,
    });
  } else if (node.id === countedSections(tree)[0]?.nodeId) {
    for (const line of tree.intro) lines.push({ from: 'ready', text: fill(line, tree, conversation, node.id) });
  } else {
    const previous = previousExchange(tree, conversation, node.id);
    if (previous !== null) lines.push(...previous);
  }
  lines.push({ from: 'ready', text: promptText(tree, conversation, node) });
  if (fixing !== null && !fixing.done) {
    const earlier = answeredText(conversation, node.id);
    if (earlier !== null) lines.push({ from: 'parent', text: earlier });
  }
  if (fixing?.done) {
    const spoken = answeredText(conversation, node.id);
    if (spoken !== null) lines.push({ from: 'parent', text: spoken });
    lines.push({
      from: 'ready',
      text: `Got it. I've updated ${section.reviewLabel}. The other sections stay the same.`,
    });
  }
  return lines;
}

function previousExchange(tree: IntakeTree, conversation: Conversation, nodeId: string): AskLine[] | null {
  let previous: { id: string; prompt: string; text: string } | null = null;
  for (const section of tree.sections) {
    for (const node of tree.nodes) {
      if (node.sectionId !== section.id) continue;
      if (node.id === nodeId) {
        if (previous === null) return null;
        return [
          { from: 'ready', text: fill(previous.prompt, tree, conversation, previous.id) },
          { from: 'parent', text: previous.text },
        ];
      }
      const text = answeredText(conversation, node.id);
      if (text !== null) previous = { id: node.id, prompt: node.prompt, text };
    }
  }
  return null;
}

function lastAnswer(tree: IntakeTree, conversation: Conversation): string | null {
  let text: string | null = null;
  for (const section of tree.sections) {
    for (const node of tree.nodes) {
      if (node.sectionId !== section.id) continue;
      const spoken = answeredText(conversation, node.id);
      if (spoken !== null) text = spoken;
    }
  }
  return text;
}

function progressFor(section: IntakeSection, counted: readonly IntakeSection[]): { label: string; index: number } {
  if (section.kind === 'medical') return { label: 'Optional · Medical', index: counted.length };
  const index = counted.findIndex((item) => item.id === section.id) + 1;
  return { label: `Section ${index} of ${counted.length} · ${section.title}`, index };
}

function locate(tree: IntakeTree, conversation: Conversation): { node: IntakeNode; section: IntakeSection } | null {
  if (conversation.talk.mode !== 'ask' && conversation.talk.mode !== 'fixing') return null;
  const node = nodeById(tree, conversation.talk.nodeId);
  if (node === undefined) return null;
  const section = sectionById(tree, node.sectionId);
  if (section === undefined) return null;
  return { node, section };
}

function afterSection(tree: IntakeTree, sectionId: string, medical: Conversation['medical']): Talk {
  const counted = countedSections(tree);
  const index = counted.findIndex((section) => section.id === sectionId);
  const next = counted[index + 1];
  if (next !== undefined) return { mode: 'ask', nodeId: next.nodeId };
  if (medical !== 'unasked') return { mode: 'reviewWait' };
  return { mode: 'medicalOffer' };
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

function openedFollow(tree: IntakeTree, node: IntakeNode, text: string): string | null {
  if (node.follow === undefined) return null;
  if (tree.nodes.some((other) => other.follow?.nodeId === node.id)) return null;
  if (text.trim().length > node.follow.maxChars) return null;
  return node.follow.nodeId;
}

function rowFor(tree: IntakeTree, conversation: Conversation, section: IntakeSection): ProjectRow {
  const parts: string[] = [];
  let skipped = false;
    for (const node of tree.nodes) {
      if (node.sectionId !== section.id) continue;
      if (conversation.answers[node.id]?.kind === 'skipped') skipped = true;
      const text = spokenPart(tree, conversation, node);
      if (text !== null) parts.push(text);
    }
  const text = spaceSentences(parts.join(' '));
  const drafted = section.kind === 'medical' ? conversation.medical !== 'declined' && !skipped && text.length > 0 : text.length > 0;
  return {
    sectionId: section.id,
    label: section.reviewLabel,
    state: drafted ? 'drafted' : 'skipped',
    text: drafted ? text : '',
  };
}

function joined(tree: IntakeTree, conversation: Conversation, match: (write: Write) => boolean): string {
  const parts: string[] = [];
  for (const section of tree.sections) {
    for (const node of tree.nodes) {
      if (node.sectionId !== section.id) continue;
      if (!node.writes.some(match)) continue;
      const text = spokenPart(tree, conversation, node);
      if (text === null) continue;
      parts.push(text);
    }
  }
  return spaceSentences(parts.join(' '));
}

function answeredText(conversation: Conversation, nodeId: string): string | null {
  const answer = conversation.answers[nodeId];
  if (answer === undefined || answer.kind !== 'answered') return null;
  const text = answer.text.trim();
  return text.length === 0 ? null : text;
}

function spokenPart(tree: IntakeTree, conversation: Conversation, node: IntakeNode): string | null {
  const text = answeredText(conversation, node.id);
  if (text === null) return null;
  const follow = tree.nodes.some((other) => other.follow?.nodeId === node.id);
  if (!follow || /[.!?]$/u.test(text)) return text;
  return `${text}.`;
}

function promptText(tree: IntakeTree, conversation: Conversation, node: IntakeNode): string {
  const text = fill(node.prompt, tree, conversation, node.id);
  if (conversation.talk.mode !== 'ask') return text;
  const section = sectionById(tree, node.sectionId);
  if (section === undefined || section.kind !== 'counted' || section.nodeId !== node.id) return text;
  if (countedSections(tree)[0]?.id === section.id) return text;
  return `${tree.acknowledgement} ${text}`;
}

function fill(template: string, tree: IntakeTree, conversation: Conversation, nodeId: string): string {
  return template.replaceAll('{parent}', tree.parentName).replaceAll('{prior}', priorFor(tree, conversation, nodeId));
}

function priorFor(tree: IntakeTree, conversation: Conversation, nodeId: string): string {
  for (const node of tree.nodes) {
    if (node.follow?.nodeId !== nodeId) continue;
    const answer = conversation.answers[node.id];
    if (answer?.kind === 'answered') return answer.text.trim().replace(/[.!?]+$/u, '');
  }
  return '';
}

function countedSections(tree: IntakeTree): IntakeSection[] {
  return tree.sections.filter((section) => section.kind === 'counted');
}

function nodeById(tree: IntakeTree, id: string): IntakeNode | undefined {
  return tree.nodes.find((node) => node.id === id);
}

function sectionById(tree: IntakeTree, id: string): IntakeSection | undefined {
  return tree.sections.find((section) => section.id === id);
}
