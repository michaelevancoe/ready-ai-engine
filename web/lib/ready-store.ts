import { initialVisit, reduceVisit, type Visit, type VisitEvent } from './visit.ts';

export const CHURCH_PHOTO_SLOTS = ['outside', 'doors', 'desk', 'classroom', 'quiet', 'pickup'] as const;

export type ChurchPhotoSlot = (typeof CHURCH_PHOTO_SLOTS)[number];

export type ChurchPhotoSet = Readonly<Record<ChurchPhotoSlot, string | null>>;

const emptyPhotos: ChurchPhotoSet = Object.freeze({
  outside: null,
  doors: null,
  desk: null,
  classroom: null,
  quiet: null,
  pickup: null,
});

export function emptyChurchPhotos(): ChurchPhotoSet {
  return emptyPhotos;
}

export function replaceChurchPhoto(current: ChurchPhotoSet, slot: ChurchPhotoSlot, url: string | null): ChurchPhotoSet {
  if (current[slot] === url) return current;
  const previous = current[slot];
  if (previous !== null && previous.startsWith('blob:')) URL.revokeObjectURL(previous);
  return { ...current, [slot]: url };
}

export interface ReadyStore {
  getState(): Visit;
  dispatch(event: VisitEvent): void;
  subscribe(listener: () => void): () => void;
  getChurchPhotos(): ChurchPhotoSet;
  setChurchPhoto(slot: ChurchPhotoSlot, url: string): void;
  clearChurchPhoto(slot: ChurchPhotoSlot): void;
}

export class DemoStore implements ReadyStore {
  private visit: Visit = initialVisit();
  private photos: ChurchPhotoSet = emptyChurchPhotos();
  private readonly listeners = new Set<() => void>();

  getState = (): Visit => this.visit;

  dispatch = (event: VisitEvent): void => {
    const next = reduceVisit(this.visit, event);
    if (next === this.visit) return;
    this.visit = next;
    this.emit();
  };

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getChurchPhotos = (): ChurchPhotoSet => this.photos;

  setChurchPhoto = (slot: ChurchPhotoSlot, url: string): void => {
    this.changePhoto(slot, url);
  };

  clearChurchPhoto = (slot: ChurchPhotoSlot): void => {
    this.changePhoto(slot, null);
  };

  private changePhoto(slot: ChurchPhotoSlot, url: string | null): void {
    const next = replaceChurchPhoto(this.photos, slot, url);
    if (next === this.photos) return;
    this.photos = next;
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
