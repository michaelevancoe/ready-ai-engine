import { initialConversation, project, reduceConversation, type Conversation, type ConversationEvent } from './conversation.ts';
import { initialGate, reduceGate, type GateEvent, type IntakeGate } from './desk.ts';
import { intakeTree } from './intake-tree.ts';

export const BRIEF_FIELDS = [
  'loves',
  'overwhelms',
  'whatHelps',
  'communication',
  'sensory',
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
}

export interface LessonAdaptation {
  readonly summary: string;
  readonly steps: readonly string[];
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
  readonly lessonSource: string;
  readonly lesson: ReviewGate<LessonAdaptation>;
}

export type VisitEvent =
  | { readonly type: 'role'; readonly role: DemoRole }
  | { readonly type: 'intake'; readonly event: GateEvent }
  | { readonly type: 'conversation'; readonly event: ConversationEvent }
  | { readonly type: 'saveCard'; readonly card: ProfileCard }
  | { readonly type: 'visibility'; readonly field: BriefField; readonly on: boolean }
  | { readonly type: 'writeStory' }
  | { readonly type: 'storyReady'; readonly value: SocialStory }
  | { readonly type: 'storyFailed'; readonly message: string }
  | { readonly type: 'approveStory' }
  | { readonly type: 'approveBrief' }
  | { readonly type: 'saveNotes'; readonly notes: string }
  | { readonly type: 'writeUpdate' }
  | { readonly type: 'updateReady'; readonly value: SundayUpdate }
  | { readonly type: 'updateFailed'; readonly message: string }
  | { readonly type: 'approveUpdate'; readonly body: string }
  | { readonly type: 'saveChurch'; readonly church: ChurchSetup }
  | { readonly type: 'setLesson'; readonly source: string }
  | { readonly type: 'writeLesson'; readonly source: string }
  | { readonly type: 'lessonReady'; readonly value: LessonAdaptation }
  | { readonly type: 'lessonFailed'; readonly message: string }
  | { readonly type: 'approveLesson' };

export type CheckIn =
  | { readonly status: 'withheld' }
  | { readonly status: 'approved'; readonly lines: readonly BriefLine[] };

export const BRIEF_LABELS: Record<BriefField, string> = {
  loves: 'Loves',
  overwhelms: 'Overwhelms',
  whatHelps: 'What helps',
  communication: 'Communication',
  sensory: 'Sensory needs',
  medical: 'Medical / health notes',
};

export function initialVisit(): Visit {
  return {
    role: 'parent',
    intake: initialGate(),
    conversation: reduceConversation(intakeTree, initialConversation(), { type: 'start' }),
    card: blankCard(),
    cardTouched: false,
    visibility: {
      loves: true,
      overwhelms: true,
      whatHelps: true,
      communication: true,
      sensory: true,
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
      leader: 'Devon Placeholder',
      ages: 'Ages 5\u201312',
      plan: 'A short welcome, one song, and a quiet activity.',
    },
    lessonSource: '',
    lesson: { phase: 'idle' },
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
      if (visit.intake.status !== 'approved' || visit.story.phase === 'writing') return visit;
      return { ...visit, story: { phase: 'writing' } };
    case 'storyReady':
      if (visit.story.phase !== 'writing') return visit;
      return { ...visit, story: { phase: 'ready', value: event.value } };
    case 'storyFailed':
      if (visit.story.phase !== 'writing') return visit;
      return { ...visit, story: { phase: 'failed', message: event.message } };
    case 'approveStory':
      if (visit.story.phase !== 'ready') return visit;
      return { ...visit, story: { phase: 'approved', value: visit.story.value } };
    case 'approveBrief':
      if (visit.intake.status !== 'approved') return visit;
      return { ...visit, brief: { phase: 'approved', lines: briefLines(visit.card, visit.visibility) } };
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
      return { ...visit, church: event.church };
    case 'setLesson':
      if (visit.lessonSource === event.source) return visit;
      return { ...visit, lessonSource: event.source, lesson: { phase: 'idle' } };
    case 'writeLesson':
      if (visit.lesson.phase === 'writing') return visit;
      return { ...visit, lessonSource: event.source, lesson: { phase: 'writing' } };
    case 'lessonReady':
      if (visit.lesson.phase !== 'writing') return visit;
      return { ...visit, lesson: { phase: 'ready', value: event.value } };
    case 'lessonFailed':
      if (visit.lesson.phase !== 'writing') return visit;
      return { ...visit, lesson: { phase: 'failed', message: event.message } };
    case 'approveLesson':
      if (visit.role !== 'leader' || visit.lesson.phase !== 'ready') return visit;
      return { ...visit, lesson: { phase: 'approved', value: visit.lesson.value } };
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

export function childPreferredName(visit: Visit): string {
  switch (visit.role) {
    case 'parent':
    case 'volunteer':
    case 'leader':
      return intakeTree.child.preferredName;
    default: {
      const leftover: never = visit.role;
      return leftover;
    }
  }
}

export function childHeading(name: string): string {
  if (name === 'Rowan') return 'Rowan Sampleton';
  return name;
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

function withdrawnBrief(): Pick<Visit, 'brief' | 'story' | 'lesson'> {
  return {
    brief: { phase: 'open' },
    story: { phase: 'idle' },
    lesson: { phase: 'idle' },
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
  if (!resetsGate(event) || !staleGate(visit.intake)) return { ...visit, conversation };
  return { ...visit, conversation, intake: { status: 'idle' } };
}

function resetsGate(event: ConversationEvent): boolean {
  switch (event.type) {
    case 'answer':
    case 'skip':
    case 'declineMedical':
    case 'acceptMedical':
    case 'reopen':
      return true;
    case 'start':
    case 'fix':
    case 'finishFix':
      return false;
    default: {
      const leftover: never = event;
      return leftover;
    }
  }
}

function staleGate(gate: IntakeGate): boolean {
  switch (gate.status) {
    case 'draft':
    case 'approving':
    case 'error':
    case 'submitting':
      return true;
    case 'idle':
    case 'approved':
      return false;
    default: {
      const leftover: never = gate;
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
    medical: '',
  };
}
