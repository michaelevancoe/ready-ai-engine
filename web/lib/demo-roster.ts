export const LEADER_STEPS = [
  'No brief yet',
  'No notes yet',
  'Notes from Jordan',
  'Draft to approve',
  'Sent to parent',
] as const;

export type LeaderStep = (typeof LEADER_STEPS)[number];

export const VOLUNTEER_STEPS = ['No brief yet', 'Brief ready', 'Brief ready \u00b7 Notes saved'] as const;

export type VolunteerStep = (typeof VOLUNTEER_STEPS)[number];

export interface SeededChild {
  readonly name: string;
  readonly ageYears: number;
  readonly leader: LeaderStep;
  readonly volunteer: VolunteerStep;
}

export const SEEDED_CHILDREN: readonly SeededChild[] = Object.freeze([
  Object.freeze({
    name: 'Owen',
    ageYears: 8,
    leader: 'No brief yet',
    volunteer: 'No brief yet',
  }),
  Object.freeze({
    name: 'Nora',
    ageYears: 6,
    leader: 'No notes yet',
    volunteer: 'Brief ready',
  }),
  Object.freeze({
    name: 'Ezra',
    ageYears: 7,
    leader: 'Notes from Jordan',
    volunteer: 'Brief ready \u00b7 Notes saved',
  }),
  Object.freeze({
    name: 'Hazel',
    ageYears: 11,
    leader: 'Draft to approve',
    volunteer: 'Brief ready \u00b7 Notes saved',
  }),
  Object.freeze({
    name: 'Lucy',
    ageYears: 10,
    leader: 'Sent to parent',
    volunteer: 'Brief ready \u00b7 Notes saved',
  }),
]);

export function seededChildren(liveName: string): readonly SeededChild[] {
  const live = liveName.trim().toLowerCase();
  return SEEDED_CHILDREN.filter((child) => child.name.toLowerCase() !== live);
}

export function leaderTagKind(step: LeaderStep): 'plain' | 'ready' | 'approved' {
  switch (step) {
    case 'No brief yet':
    case 'No notes yet':
      return 'plain';
    case 'Notes from Jordan':
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
