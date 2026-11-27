import type { DraftResult } from './drafts.ts';
import { postSundayUpdate } from './drafts.ts';
import type { ProfileId, ShownProfile } from './desk.ts';
import { exampleProfile } from './example-briefs.ts';
import { briefLines, childAgeYears, childPreferredName, initialVisit, reduceVisit, type SundayUpdate, type Visit, type VisitEvent } from './visit.ts';

export const LEADER_STEPS = [
  'No brief yet',
  'No notes yet',
  'Ready to draft',
  'Draft to approve',
  'Sent to parent',
] as const;

export type LeaderStep = (typeof LEADER_STEPS)[number];

export const VOLUNTEER_STEPS = ['No brief yet', 'Brief ready', 'Brief ready \u00b7 Notes saved'] as const;

export type VolunteerStep = (typeof VOLUNTEER_STEPS)[number];

export interface VisitRecord {
  readonly id: string;
  readonly visit: Visit;
  readonly sample: boolean;
  readonly cannedDraft: string | null;
}

const SAMPLE_IDS = ['owen', 'nora', 'ezra', 'hazel', 'lucy'] as const;

export type SampleId = (typeof SAMPLE_IDS)[number];

const SIGN_OFF = 'Ms. Dana\nExample Harbor Fellowship';

interface SampleSpec {
  readonly id: SampleId;
  readonly name: string;
  readonly age: string;
  readonly about: string;
  readonly lines: readonly string[];
  readonly helps: readonly string[];
  readonly allergyMore: string | null;
  readonly notes: string;
  readonly draft: string | null;
  readonly stage: 'idle' | 'ready' | 'sent';
}

function signed(paragraph: string): string {
  return `${paragraph}\n\n${SIGN_OFF}`;
}

const SAMPLES: readonly SampleSpec[] = [
  {
    id: 'owen',
    name: 'Owen',
    age: '8',
    about: '',
    lines: [],
    helps: [],
    allergyMore: null,
    notes: '',
    draft: null,
    stage: 'idle',
  },
  {
    id: 'nora',
    name: 'Nora',
    age: '6',
    about: 'Nora loves songs and stays close to a familiar adult.',
    lines: [
      'Nora loves horses and songs with hand motions',
      'Being rushed at drop-off',
      'A two-minute warning before anything changes',
      'She talks a lot. Give one step at a time',
      'Likes to sit at the end of the row',
      'Needs a reminder before story time',
      'No known allergies',
      'No, not usually',
    ],
    helps: [
      'Give Nora a two-minute warning before a change.',
      'Give Nora one step at a time.',
      'Let Nora sit at the end of the row.',
      'Stay close to a familiar adult.',
    ],
    allergyMore: null,
    notes: '',
    draft: null,
    stage: 'idle',
  },
  {
    id: 'ezra',
    name: 'Ezra',
    age: '7',
    about: 'Ezra likes counting and stays for the whole story when he knows what is next.',
    lines: [
      'Ezra loves dinosaurs and counting things',
      'Snack running late, or sudden changes',
      'A 2-minute warning and the blue cushion nearby',
      'Full sentences. Give him a moment to answer',
      'Sits best on a cushion',
      'Goes on his own; tells an adult first',
      'Dairy free',
      'May walk away when upset. Stay close and calm',
    ],
    helps: [
      'Give Ezra a 2-minute warning before a change.',
      'Give Ezra time to answer in full sentences.',
      'Stay close if Ezra walks away.',
    ],
    allergyMore: 'Dairy-free snack, please',
    notes:
      'Sat with the group for the whole story. Upset when snack ran late; a 2-minute warning helped. Built a tall block tower and showed everyone.',
    draft: signed(
      'Ezra stayed for the whole story. When snack ran late, a 2-minute warning helped. He built a tall block tower and showed everyone.',
    ),
    stage: 'idle',
  },
  {
    id: 'hazel',
    name: 'Hazel',
    age: '11',
    about: 'Hazel likes to help and comes back on her own after a break.',
    lines: [
      'Hazel loves helping and reading aloud',
      'A loud room',
      'A break in the quiet corner when the room gets loud',
      'She reads aloud when she is ready',
      'Loud rooms are hard, and a quiet corner helps',
      'She goes on her own',
      'No known allergies',
      'She comes back on her own after a short break',
    ],
    helps: [
      'Offer Hazel a break in the quiet corner.',
      'Let Hazel read aloud when she is ready.',
      'Let Hazel come back on her own after a break.',
    ],
    allergyMore: null,
    notes:
      'Helped set out the craft supplies. Read the memory verse aloud. Took one break in the quiet corner when it got loud and came back on her own.',
    draft: signed(
      'Hazel had a calm, helpful morning. She set out the craft supplies and read the memory verse aloud. When the room got loud, she took a short break in the quiet corner and came back on her own.',
    ),
    stage: 'ready',
  },
  {
    id: 'lucy',
    name: 'Lucy',
    age: '10',
    about: 'Lucy joins story time and stays with the group after one reminder.',
    lines: [
      'Lucy loves story time and answering questions',
      'Leaving the group at pickup',
      'One reminder to stay with the group at pickup',
      'She answers questions at story time',
      'She does best near the rest of the group',
      'She goes on her own',
      'No known allergies',
      'No, not usually',
    ],
    helps: [
      'Give Lucy one reminder at pickup.',
      'Let Lucy answer questions at story time.',
      'Keep Lucy near the rest of the group.',
    ],
    allergyMore: null,
    notes: 'Great morning. Answered two questions at story time. Needed one reminder to stay with the group at pickup.',
    draft: signed(
      'Lucy had a great morning. She joined in at story time and answered two questions. At pickup she stayed with the group after one reminder.',
    ),
    stage: 'sent',
  },
];

const EVENT_LISTS: Record<SampleId, readonly VisitEvent[]> = {
  owen: eventsFor(specFor('owen')),
  nora: eventsFor(specFor('nora')),
  ezra: eventsFor(specFor('ezra')),
  hazel: eventsFor(specFor('hazel')),
  lucy: eventsFor(specFor('lucy')),
};

for (const spec of SAMPLES) checkSeed(spec, play(EVENT_LISTS[spec.id]));

export function seedEvents(id: SampleId): readonly VisitEvent[] {
  return EVENT_LISTS[id];
}

export function seedDemoVisits(): VisitRecord[] {
  const rowan: VisitRecord = { id: 'rowan', visit: seededLiveVisit(), sample: false, cannedDraft: null };
  return [rowan, ...SAMPLES.map((spec) => ({ id: spec.id, visit: play(EVENT_LISTS[spec.id]), sample: true, cannedDraft: spec.draft }))];
}

export function leaderStep(visit: Visit): LeaderStep {
  if (visit.brief.phase === 'open') return 'No brief yet';
  if (visit.update.phase === 'approved') return 'Sent to parent';
  if (visit.notes.trim() === '') return 'No notes yet';
  if (visit.update.phase === 'ready' || visit.update.phase === 'writing') return 'Draft to approve';
  return 'Ready to draft';
}

export function volunteerStep(visit: Visit): VolunteerStep {
  if (visit.brief.phase === 'open') return 'No brief yet';
  if (visit.notes.trim() === '') return 'Brief ready';
  return 'Brief ready \u00b7 Notes saved';
}

export function leaderTagKind(step: LeaderStep): 'plain' | 'ready' | 'approved' {
  switch (step) {
    case 'No brief yet':
    case 'No notes yet':
      return 'plain';
    case 'Ready to draft':
    case 'Draft to approve':
      return 'ready';
    case 'Sent to parent':
      return 'approved';
    default: {
      const leftover: never = step;
      return leftover;
    }
  }
}

export function draftSundayNote(
  record: VisitRecord,
  input: { readonly notes: string; readonly childName: string; readonly leader: string; readonly church: string },
): Promise<DraftResult<SundayUpdate>> {
  if (record.sample) {
    if (record.cannedDraft === null) return Promise.resolve({ ok: false, message: 'The draft could not be written. Try again.' });
    return Promise.resolve({ ok: true, value: { body: record.cannedDraft } });
  }
  return postSundayUpdate(input.notes, input.childName, input.leader, input.church);
}

const ROWAN_HELPS = [
  'Give Rowan a quiet break when the doorway is busy.',
  'Rowan can point or use a few words.',
  'A softer seat away from bright lights can help.',
  'Headphones can help during the song.',
] as const;

function seededLiveVisit(): Visit {
  const visit = initialVisit();
  const card = exampleProfile('rowan');
  return {
    ...visit,
    card,
    brief: { phase: 'approved', lines: briefLines(card, visit.visibility) },
    intake: { status: 'approved', profile: fictionalProfile('Rowan', 'approved', ROWAN_HELPS) },
  };
}

function play(events: readonly VisitEvent[]): Visit {
  return events.reduce(reduceVisit, initialVisit());
}

function eventsFor(spec: SampleSpec): VisitEvent[] {
  const answers = spec.lines.length === 0 ? [spec.name, spec.age] : answersFor(spec);
  const events: VisitEvent[] = [
    { type: 'conversation', event: { type: 'beginIntake' } },
    ...answers.map((text): VisitEvent => ({ type: 'conversation', event: { type: 'answer', text } })),
  ];
  if (spec.lines.length === 0) return events;
  const draft = fictionalProfile(spec.name, 'draft', spec.helps);
  const approved = fictionalProfile(spec.name, 'approved', spec.helps);
  events.push(
    { type: 'conversation', event: { type: 'approve' } },
    { type: 'intake', event: { type: 'submit', nonce: 1 } },
    { type: 'intake', event: { type: 'draft', profile: draft, nonce: 1 } },
    { type: 'intake', event: { type: 'approve' } },
    { type: 'intake', event: { type: 'approved', profile: approved } },
    { type: 'approveBrief' },
  );
  if (spec.notes !== '') events.push({ type: 'saveNotes', notes: spec.notes });
  if (spec.stage !== 'idle' && spec.draft !== null) {
    events.push(
      { type: 'role', role: 'leader' },
      { type: 'writeUpdate' },
      { type: 'updateReady', value: { body: spec.draft } },
    );
    if (spec.stage === 'sent') events.push({ type: 'approveUpdate', body: spec.draft });
    events.push({ type: 'role', role: 'parent' });
  }
  return events;
}

function answersFor(spec: SampleSpec): string[] {
  const loves = lineAt(spec.lines, 0);
  const overwhelms = lineAt(spec.lines, 1);
  const helps = lineAt(spec.lines, 2);
  const communication = lineAt(spec.lines, 3);
  const sensory = lineAt(spec.lines, 4);
  const toileting = lineAt(spec.lines, 5);
  const allergies = lineAt(spec.lines, 6);
  const calming = lineAt(spec.lines, 7);
  const answers = [spec.name, spec.age, spec.about, loves, overwhelms, helps, communication, sensory, toileting, allergies];
  if (spec.allergyMore !== null) answers.push(spec.allergyMore);
  answers.push(calming);
  return answers;
}

function lineAt(lines: readonly string[], index: number): string {
  const text = lines[index];
  if (text === undefined) throw new Error('missing brief line');
  return text;
}

function specFor(id: SampleId): SampleSpec {
  const found = SAMPLES.find((item) => item.id === id);
  if (found === undefined) throw new Error(id);
  return found;
}

function checkSeed(spec: SampleSpec, visit: Visit): void {
  if (childPreferredName(visit) !== spec.name || childAgeYears(visit) !== Number(spec.age)) {
    throw new Error(`${spec.id} resolved to ${childPreferredName(visit)}, ${childAgeYears(visit)}`);
  }
  if (spec.lines.length === 0) {
    if (visit.brief.phase !== 'open') throw new Error(`${spec.id} brief is ${visit.brief.phase}`);
    return;
  }
  if (visit.brief.phase !== 'approved') throw new Error(`${spec.id} brief is ${visit.brief.phase}`);
  if (visit.brief.lines.length !== 8) {
    throw new Error(`${spec.id} lines: ${visit.brief.lines.map((line) => line.field).join(',')}`);
  }
  if (visit.brief.lines.some((line) => line.field === 'medical')) throw new Error(`${spec.id} has a medical line`);
  if (spec.notes !== '' && visit.notes !== spec.notes) throw new Error(`${spec.id} notes were not saved`);
  if (spec.stage === 'idle' && visit.update.phase !== 'idle') throw new Error(`${spec.id} update is ${visit.update.phase}`);
  if (spec.stage === 'ready' && visit.update.phase !== 'ready') throw new Error(`${spec.id} draft is ${visit.update.phase}`);
  if (spec.stage === 'sent' && visit.update.phase !== 'approved') throw new Error(`${spec.id} was not sent`);
}

function fictionalProfile(name: string, status: 'draft' | 'approved', helps: readonly string[]): ShownProfile {
  return {
    id: '20000000-0000-4000-8000-0000000000a1' as ProfileId,
    status,
    whatHelps: helps,
    sections: [
      { heading: 'Summary', lines: [`${name} is a fictional child.`] },
      { heading: 'Sensory considerations', lines: ['None shared.'] },
      { heading: 'Support strategies', lines: ['A calm greeting.'] },
      { heading: 'Avoid', lines: ['Rushing.'] },
      { heading: 'Volunteer guidance', lines: ['Follow the brief.'] },
    ],
  };
}
