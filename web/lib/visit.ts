import {
  UNANSWERED_CHILD,
  answeredChild,
  initialConversation,
  project,
  reduceConversation,
  type Conversation,
  type ConversationEvent,
} from './conversation.ts';
import { initialGate, reduceGate, type GateEvent, type IntakeGate } from './desk.ts';
import { exampleBrief, exampleProfile, type ExampleId } from './example-briefs.ts';
import { intakeTree } from './intake-tree.ts';

export const BRIEF_FIELDS = [
  'loves',
  'overwhelms',
  'whatHelps',
  'communication',
  'sensory',
  'toileting',
  'allergies',
  'calming',
  'medical',
] as const;

export type BriefField = (typeof BRIEF_FIELDS)[number];

export type DemoRole = 'parent' | 'volunteer' | 'leader';

export type ProfileCard = Record<BriefField, string>;

export type Visibility = Record<BriefField, boolean>;

export interface BriefLine {
  readonly field: BriefField;
  readonly label: string;
  readonly text: string;
}

export type BriefGate = { readonly phase: 'open' } | { readonly phase: 'approved'; readonly lines: readonly BriefLine[] };

export type DraftGate<T> =
  | { readonly phase: 'idle' }
  | { readonly phase: 'writing' }
  | { readonly phase: 'ready'; readonly value: T }
  | { readonly phase: 'failed'; readonly message: string };

export type ReviewGate<T> = DraftGate<T> | { readonly phase: 'approved'; readonly value: T };

export type StoryGate = ReviewGate<SocialStory>;

export interface SocialStory {
  readonly title: string;
  readonly body: string;
  readonly source: 'model' | 'fallback';
}

export interface SundayUpdate {
  readonly body: string;
}

export interface ChurchSetup {
  readonly name: string;
  readonly service: string;
  readonly room: string;
  readonly leader: string;
  readonly ages: string;
  readonly plan: string;
}

export interface Visit {
  readonly role: DemoRole;
  readonly intake: IntakeGate;
  readonly conversation: Conversation;
  readonly card: ProfileCard;
  readonly cardTouched: boolean;
  readonly visibility: Visibility;
  readonly story: StoryGate;
  readonly brief: BriefGate;
  readonly notes: string;
  readonly update: ReviewGate<SundayUpdate>;
  readonly church: ChurchSetup;
}

export type VisitEvent =
  | { readonly type: 'role'; readonly role: DemoRole }
  | { readonly type: 'intake'; readonly event: GateEvent }
  | { readonly type: 'conversation'; readonly event: ConversationEvent }
  | { readonly type: 'saveCard'; readonly card: ProfileCard }
  | { readonly type: 'visibility'; readonly field: BriefField; readonly on: boolean }
  | { readonly type: 'writeStory' }
  | { readonly type: 'noteStory'; readonly value: SocialStory }
  | { readonly type: 'storyReady'; readonly value: SocialStory }
  | { readonly type: 'storyFailed'; readonly message: string }
  | { readonly type: 'approveStory' }
  | { readonly type: 'approveBrief' }
  | { readonly type: 'saveNotes'; readonly notes: string }
  | { readonly type: 'writeUpdate' }
  | { readonly type: 'updateReady'; readonly value: SundayUpdate }
  | { readonly type: 'updateFailed'; readonly message: string }
  | { readonly type: 'approveUpdate'; readonly body: string }
  | { readonly type: 'saveChurch'; readonly church: ChurchSetup };

export type CheckIn =
  | { readonly status: 'withheld' }
  | { readonly status: 'approved'; readonly lines: readonly BriefLine[] };

export const BRIEF_LABELS: Record<BriefField, string> = {
  loves: 'Loves',
  overwhelms: 'Overwhelms',
  whatHelps: 'What helps',
  communication: 'Communication',
  sensory: 'Sensory needs',
  toileting: 'Toileting',
  allergies: 'Allergies & health',
  calming: 'Safety & calming',
  medical: 'Medical / health notes',
};

export function initialVisit(): Visit {
  return {
    role: 'parent',
    intake: initialGate(),
    conversation: initialConversation(),
    card: blankCard(),
    cardTouched: false,
    visibility: {
      loves: true,
      overwhelms: true,
      whatHelps: true,
      communication: true,
      sensory: true,
      toileting: true,
      allergies: true,
      calming: true,
      medical: false,
    },
    story: { phase: 'idle' },
    brief: { phase: 'open' },
    notes: '',
    update: { phase: 'idle' },
    church: {
      name: 'Example Harbor Fellowship',
      service: 'Sunday 9:30',
      room: 'Harbor Room',
      leader: 'Ms. Dana',
      ages: 'Ages 5\u201312',
      plan: 'A short welcome, one song, and a quiet activity.',
    },
  };
}

export function reduceVisit(visit: Visit, event: VisitEvent): Visit {
  switch (event.type) {
    case 'role':
      if (visit.role === event.role) return visit;
      return { ...visit, role: event.role };
    case 'intake':
      return applyIntake(visit, event.event);
    case 'conversation':
      return applyConversation(visit, event.event);
    case 'saveCard':
      return {
        ...visit,
        card: event.card,
        cardTouched: true,
        ...withdrawnBrief(),
      };
    case 'visibility':
      return {
        ...visit,
        visibility: { ...visit.visibility, [event.field]: event.on },
        ...withdrawnBrief(),
      };
    case 'writeStory':
      if (!briefAlreadyApproved(visit) || showingExample(visit) || visit.story.phase === 'writing') return visit;
      return { ...visit, story: { phase: 'writing' } };
    case 'noteStory':
      if (visit.story.phase === 'writing' || visit.brief.phase !== 'approved') return visit;
      return { ...visit, story: { phase: 'ready', value: event.value } };
    case 'storyReady':
      if (visit.story.phase !== 'writing') return visit;
      return { ...visit, story: { phase: 'ready', value: event.value } };
    case 'storyFailed':
      if (visit.story.phase !== 'writing') return visit;
      return { ...visit, story: { phase: 'failed', message: event.message } };
    case 'approveStory':
      if (visit.story.phase !== 'ready') return visit;
      return { ...visit, story: { phase: 'approved', value: visit.story.value } };
    case 'approveBrief': {
      if (!briefAlreadyApproved(visit)) return visit;
      const card = project(intakeTree, visit.conversation).card;
      return { ...visit, card, brief: { phase: 'approved', lines: briefLines(card, visit.visibility) } };
    }
    case 'saveNotes':
      return { ...visit, notes: event.notes };
    case 'writeUpdate':
      if (visit.role !== 'leader' || visit.notes.trim() === '' || visit.update.phase === 'writing') return visit;
      return { ...visit, update: { phase: 'writing' } };
    case 'updateReady':
      if (visit.update.phase !== 'writing') return visit;
      return { ...visit, update: { phase: 'ready', value: event.value } };
    case 'updateFailed':
      if (visit.update.phase !== 'writing') return visit;
      return { ...visit, update: { phase: 'failed', message: event.message } };
    case 'approveUpdate': {
      if (visit.role !== 'leader' || visit.update.phase !== 'ready') return visit;
      const body = event.body.trim();
      if (body.length === 0) return visit;
      return { ...visit, update: { phase: 'approved', value: { body } } };
    }
    case 'saveChurch':
      return saveChurch(visit, event.church);
    default: {
      const leftover: never = event;
      return leftover;
    }
  }
}

export function briefLines(card: ProfileCard, visibility: Visibility): BriefLine[] {
  const lines: BriefLine[] = [];
  for (const field of BRIEF_FIELDS) {
    if (!visibility[field]) continue;
    const text = card[field].trim();
    if (text.length === 0) continue;
    lines.push({ field, label: BRIEF_LABELS[field], text });
  }
  return lines;
}

export function exampleLines(id: ExampleId, visibility: Visibility): BriefLine[] {
  return briefLines(exampleProfile(id), visibility);
}

export function childPreferredName(visit: Visit): string {
  const example = talkExample(visit.conversation);
  if (example !== null) return exampleBrief(example).name;
  return answeredChild(visit.conversation)?.preferredName ?? UNANSWERED_CHILD.preferredName;
}

export function childAgeYears(visit: Visit): number {
  const example = talkExample(visit.conversation);
  if (example !== null) return exampleBrief(example).ageYears;
  return answeredChild(visit.conversation)?.ageYears ?? UNANSWERED_CHILD.ageYears;
}

export function childHeading(name: string): string {
  return name;
}

export function volunteerRoster(
  visit: Visit,
): readonly { readonly heading: string; readonly status: 'Brief ready' | 'No brief yet' }[] {
  return [
    {
      heading: `${childPreferredName(visit)}, ${childAgeYears(visit)}`,
      status: checkInBrief(visit).status === 'approved' ? 'Brief ready' : 'No brief yet',
    },
  ];
}

export function briefAlreadyApproved(visit: Visit): boolean {
  return visit.intake.status === 'approved' || visit.brief.phase === 'approved';
}

export function showingExample(visit: Visit): boolean {
  const talk = visit.conversation.talk;
  if (talk.mode !== 'brief' && talk.mode !== 'approved') return false;
  return talk.source.type === 'example';
}

export function checkInBrief(visit: Visit): CheckIn {
  switch (visit.brief.phase) {
    case 'open':
      return { status: 'withheld' };
    case 'approved':
      return { status: 'approved', lines: visit.brief.lines };
    default: {
      const leftover: never = visit.brief;
      return leftover;
    }
  }
}

export function readyValue<T>(gate: DraftGate<T>): T | null {
  switch (gate.phase) {
    case 'idle':
    case 'writing':
    case 'failed':
      return null;
    case 'ready':
      return gate.value;
    default: {
      const leftover: never = gate;
      return leftover;
    }
  }
}

export function approvedValue<T>(gate: ReviewGate<T>): T | null {
  switch (gate.phase) {
    case 'idle':
    case 'writing':
    case 'failed':
    case 'ready':
      return null;
    case 'approved':
      return gate.value;
    default: {
      const leftover: never = gate;
      return leftover;
    }
  }
}

export function reviewValue<T>(gate: ReviewGate<T>): T | null {
  switch (gate.phase) {
    case 'idle':
    case 'writing':
    case 'failed':
      return null;
    case 'ready':
    case 'approved':
      return gate.value;
    default: {
      const leftover: never = gate;
      return leftover;
    }
  }
}

function saveChurch(visit: Visit, church: ChurchSetup): Visit {
  const changed =
    visit.church.name !== church.name ||
    visit.church.service !== church.service ||
    visit.church.room !== church.room ||
    visit.church.leader !== church.leader ||
    visit.church.plan !== church.plan;
  if (!changed) return { ...visit, church };
  return { ...visit, church, story: { phase: 'idle' } };
}

function withdrawnBrief(): Pick<Visit, 'brief' | 'story'> {
  return {
    brief: { phase: 'open' },
    story: { phase: 'idle' },
  };
}

function applyIntake(visit: Visit, event: GateEvent): Visit {
  const intake = reduceGate(visit.intake, event);
  if (intake === visit.intake) return visit;
  if (visit.intake.status !== 'approved' && intake.status === 'approved' && !visit.cardTouched) {
    return { ...visit, intake, card: project(intakeTree, visit.conversation).card };
  }
  return { ...visit, intake };
}

function applyConversation(visit: Visit, event: ConversationEvent): Visit {
  const conversation = reduceConversation(intakeTree, visit.conversation, event);
  if (conversation === visit.conversation) return visit;
  const nextExample = talkExample(conversation);
  if (nextExample !== null) {
    const card = exampleProfile(nextExample);
    return {
      ...visit,
      conversation,
      card,
      cardTouched: false,
      brief: { phase: 'approved', lines: briefLines(card, visit.visibility) },
    };
  }
  if (talkExample(visit.conversation) !== null) {
    return {
      ...visit,
      conversation,
      card: blankCard(),
      cardTouched: false,
      ...withdrawnBrief(),
    };
  }
  return { ...visit, conversation };
}

function talkExample(conversation: Conversation): ExampleId | null {
  switch (conversation.talk.mode) {
    case 'brief':
    case 'approved':
      return conversation.talk.source.type === 'example' ? conversation.talk.source.id : null;
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

function blankCard(): ProfileCard {
  return {
    loves: '',
    overwhelms: '',
    whatHelps: '',
    communication: '',
    sensory: '',
    toileting: '',
    allergies: '',
    calming: '',
    medical: '',
  };
}
