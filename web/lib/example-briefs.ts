import type { SectionId } from './intake-tree.ts';

export type ExampleId = 'rowan' | 'maya' | 'jonah';

export interface ExampleCard {
  readonly sectionId: Exclude<SectionId, 'about'>;
  readonly label: string;
  readonly text: string;
}

export interface ExampleBrief {
  readonly id: ExampleId;
  readonly name: string;
  readonly ageYears: number;
  readonly blurb: string;
  readonly summary: string;
  readonly photos: readonly [string, string, string];
  readonly cards: readonly ExampleCard[];
}

const CARD_IDS = [
  'loves',
  'overwhelms',
  'helps',
  'communication',
  'sensory',
  'toileting',
  'allergies',
  'behavior',
] as const satisfies readonly Exclude<SectionId, 'about'>[];

const CARD_LABELS = {
  loves: 'Loves',
  overwhelms: 'Overwhelms',
  helps: 'What helps',
  communication: 'Communication',
  sensory: 'Sensory',
  toileting: 'Toileting',
  allergies: 'Allergies & health',
  behavior: 'Safety & calming',
} as const satisfies Record<(typeof CARD_IDS)[number], string>;

const ROWAN = brief('rowan', 'Rowan', 7, 'Loves Disney · needs quiet breaks', 'Rowan loves Disney and needs quiet breaks.', ['Rowan', 'His headphones', 'Quiet corner'], {
  loves: 'Rowan loves Disney stories and quiet songs.',
  overwhelms: 'A crowded doorway overwhelms Rowan.',
  helps: 'A quiet break helps Rowan settle.',
  communication: 'Rowan points and uses a few words.',
  sensory: 'Rowan needs a softer seat away from bright lights.',
  toileting: 'Rowan tells an adult when he needs the bathroom.',
  allergies: 'Rowan has no known allergies.',
  behavior: 'Rowan does not usually hurt himself or run off.',
});

const MAYA = brief(
  'maya',
  'Maya',
  5,
  'Loves dinosaurs · peanut allergy',
  'Maya loves dinosaurs and has a peanut allergy.',
  ['Maya', 'Her dinosaurs', 'A dim corner'],
  {
    loves: 'Maya loves dinosaurs and digging in the sand table.',
    overwhelms: 'Sudden loud songs overwhelm Maya.',
    helps: 'A warning before a change helps Maya.',
    communication: 'Maya tells an adult with short sentences.',
    sensory: 'Maya prefers a dim corner when the room is loud.',
    toileting: 'Maya tells an adult and needs a reminder at transitions.',
    allergies: 'Maya has a peanut allergy, and a volunteer should keep peanut foods away and tell the room leader.',
    behavior: 'Maya sometimes needs a quiet lap and does not run off.',
  },
);

const JONAH = brief(
  'jonah',
  'Jonah',
  9,
  'Loves Lego · uses picture cards',
  'Jonah loves Lego and uses picture cards.',
  ['Jonah', 'His Lego', 'Picture cards'],
  {
    loves: 'Jonah loves Lego and building on the floor.',
    overwhelms: 'A rushed transition overwhelms Jonah.',
    helps: 'A picture of the next activity helps Jonah.',
    communication: 'Jonah uses picture cards.',
    sensory: 'Jonah likes a firm seat and a predictable sound level.',
    toileting: 'Jonah uses a sign or picture when he needs the bathroom.',
    allergies: 'Jonah has no known allergies.',
    behavior: 'Jonah stays with the group when an adult shows him a calm card.',
  },
);

export function exampleBrief(id: ExampleId): ExampleBrief {
  switch (id) {
    case 'rowan':
      return ROWAN;
    case 'maya':
      return MAYA;
    case 'jonah':
      return JONAH;
    default: {
      const leftover: never = id;
      return leftover;
    }
  }
}

export function exampleList(): readonly ExampleBrief[] {
  return [ROWAN, MAYA, JONAH];
}

export interface ExampleProfile {
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

export function exampleProfile(id: ExampleId): ExampleProfile {
  const profile: { -readonly [Key in keyof ExampleProfile]: ExampleProfile[Key] } = {
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
  for (const card of exampleBrief(id).cards) {
    profile[profileField(card.sectionId)] = card.text;
  }
  return profile;
}

function profileField(sectionId: (typeof CARD_IDS)[number]): keyof ExampleProfile {
  switch (sectionId) {
    case 'helps':
      return 'whatHelps';
    case 'behavior':
      return 'calming';
    case 'loves':
    case 'overwhelms':
    case 'communication':
    case 'sensory':
    case 'toileting':
    case 'allergies':
      return sectionId;
    default: {
      const leftover: never = sectionId;
      return leftover;
    }
  }
}

function brief(
  id: ExampleId,
  name: string,
  ageYears: number,
  blurb: string,
  summary: string,
  photos: readonly [string, string, string],
  lines: Record<(typeof CARD_IDS)[number], string>,
): ExampleBrief {
  return {
    id,
    name,
    ageYears,
    blurb,
    summary,
    photos,
    cards: CARD_IDS.map((sectionId) => ({
      sectionId,
      label: CARD_LABELS[sectionId],
      text: lines[sectionId],
    })),
  };
}
