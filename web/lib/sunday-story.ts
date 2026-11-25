import { sundayStorySentences } from '../../src/sunday-story-text.ts';
import type { ChurchPhotoSet, ChurchPhotoSlot } from './ready-store.ts';
import { childPreferredName, type Visit } from './visit.ts';

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
  const [outside, doors, desk, classroom, helper, quiet, pickup] = sundayStorySentences(church);
  return [
    {
      step: 'cover',
      title: `${name}'s Sunday at`,
      churchName: church.name,
      subtitle: 'A story to read together before Sunday',
      slot: 'cover',
    },
    { step: 1, slot: 'outside', text: outside },
    { step: 2, slot: 'doors', text: doors },
    { step: 3, slot: 'desk', text: desk },
    { step: 4, slot: 'classroom', text: classroom },
    { step: 5, slot: 'helper', text: helper },
    { step: 6, slot: 'quiet', text: quiet },
    { step: 7, slot: 'pickup', text: pickup },
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
