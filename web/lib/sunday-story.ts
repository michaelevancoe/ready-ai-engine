import type { ChurchPhotoSet, ChurchPhotoSlot } from './ready-store.ts';
import { childPreferredName, type ChurchSetup, type Visit } from './visit.ts';

export interface SundayStoryCover {
  readonly step: 'cover';
  readonly title: string;
  readonly churchName: string;
  readonly subtitle: 'A story to read together before Sunday';
  readonly slot: 'cover';
}

export interface SundayStoryStep {
  readonly step: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  readonly text: string;
  readonly slot: 'outside' | 'doors' | 'desk' | 'classroom' | 'helper' | 'quiet' | 'pickup';
}

export type SundayStoryPage = SundayStoryCover | SundayStoryStep;

export type StoryDrawing = 'building' | 'doors' | 'desk' | 'classroom' | 'helper' | 'quiet' | 'pickup';

export type StoryPicture =
  | { readonly kind: 'photo'; readonly source: 'upload' | 'sample'; readonly src: string; readonly alt: string }
  | { readonly kind: 'drawing'; readonly drawing: StoryDrawing; readonly alt: string };

export const STORY_SAMPLES: Readonly<Record<ChurchPhotoSlot, { readonly src: string; readonly alt: string }>> = {
  outside: { src: '/sunday-story/outside.jpg', alt: 'The outside of a small fictional church' },
  doors: { src: '/sunday-story/front-doors.jpg', alt: 'Front doors of a fictional church' },
  desk: { src: '/sunday-story/welcome-desk.jpg', alt: 'A welcome desk in a fictional church' },
  classroom: { src: '/sunday-story/classroom.jpg', alt: 'A classroom in a fictional church' },
  quiet: { src: '/sunday-story/quiet-spot.jpg', alt: 'A quiet corner in a fictional church room' },
  pickup: { src: '/sunday-story/pickup.jpg', alt: 'A pickup bench in a fictional church' },
};

const drawingAlt: Readonly<Record<StoryDrawing, string>> = {
  building: 'A line drawing of a church building',
  doors: 'A line drawing of front doors',
  desk: 'A line drawing of a welcome desk',
  classroom: 'A line drawing of a classroom',
  helper: 'A line drawing of a helper',
  quiet: 'A line drawing of a quiet spot',
  pickup: 'A line drawing of a pickup area',
};

export function sundayStoryPages(visit: Visit): readonly [
  SundayStoryCover,
  SundayStoryStep,
  SundayStoryStep,
  SundayStoryStep,
  SundayStoryStep,
  SundayStoryStep,
  SundayStoryStep,
  SundayStoryStep,
] {
  const name = childPreferredName(visit);
  const church = visit.church;
  return [
    {
      step: 'cover',
      title: `${name}'s Sunday at`,
      churchName: church.name,
      subtitle: 'A story to read together before Sunday',
      slot: 'cover',
    },
    { step: 1, slot: 'outside', text: arrival(church) },
    { step: 2, slot: 'doors', text: 'You walk in the front doors. A greeter smiles and says hello.' },
    { step: 3, slot: 'desk', text: 'At the welcome desk, you check in and get a name tag.' },
    { step: 4, slot: 'classroom', text: classroom(church) },
    { step: 5, slot: 'helper', text: `${church.leader} and the helpers are there to help you.` },
    { step: 6, slot: 'quiet', text: 'If you need a break, there is a quiet spot in the room.' },
    { step: 7, slot: 'pickup', text: 'When it is over, your grown-up comes back to pick you up.' },
  ];
}

export function resolveStoryPicture(
  slot: SundayStoryPage['slot'],
  photos: ChurchPhotoSet,
  samples?: Partial<Record<ChurchPhotoSlot, { readonly src: string; readonly alt: string }>>,
): StoryPicture {
  const photo = photoSlot(slot);
  if (photo === null) return drawingPicture(slot);
  const upload = photos[photo];
  if (upload !== null) return { kind: 'photo', source: 'upload', src: upload, alt: STORY_SAMPLES[photo].alt };
  const sample = (samples ?? STORY_SAMPLES)[photo];
  if (sample !== undefined) return { kind: 'photo', source: 'sample', src: sample.src, alt: sample.alt };
  return drawingPicture(photo);
}

function arrival(church: ChurchSetup): string {
  const service = church.service.trim();
  const place = `you and your grown-up go to ${church.name}.`;
  if (service === '') return `You and your grown-up go to ${church.name}.`;
  const split = service.search(/\s/u);
  if (split === -1) return `On ${service}, ${place}`;
  const day = service.slice(0, split);
  const time = service.slice(split).trim();
  return `On ${day} at ${time}, ${place}`;
}

function classroom(church: ChurchSetup): string {
  return `You go to the ${church.room}. You will have ${planClause(church.plan)}`;
}

function planClause(plan: string): string {
  const trimmed = plan.trim();
  const lowered = `${trimmed.charAt(0).toLowerCase()}${trimmed.slice(1)}`;
  if (/[.!?]$/u.test(lowered)) return lowered;
  return `${lowered}.`;
}

function photoSlot(slot: SundayStoryPage['slot']): ChurchPhotoSlot | null {
  switch (slot) {
    case 'cover':
    case 'helper':
      return null;
    case 'outside':
    case 'doors':
    case 'desk':
    case 'classroom':
    case 'quiet':
    case 'pickup':
      return slot;
    default: {
      const leftover: never = slot;
      return leftover;
    }
  }
}

function drawingPicture(slot: SundayStoryPage['slot']): StoryPicture {
  const drawing = drawingFor(slot);
  return { kind: 'drawing', drawing, alt: drawingAlt[drawing] };
}

function drawingFor(slot: SundayStoryPage['slot']): StoryDrawing {
  switch (slot) {
    case 'cover':
    case 'outside':
      return 'building';
    case 'doors':
      return 'doors';
    case 'desk':
      return 'desk';
    case 'classroom':
      return 'classroom';
    case 'helper':
      return 'helper';
    case 'quiet':
      return 'quiet';
    case 'pickup':
      return 'pickup';
    default: {
      const leftover: never = slot;
      return leftover;
    }
  }
}
