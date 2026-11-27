import { seedDemoVisits, type VisitRecord } from './demo-visits.ts';
import { reduceVisit, type Visit, type VisitEvent } from './visit.ts';

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
  listVisits(): readonly VisitRecord[];
  getVisit(id: string): VisitRecord | null;
  select(id: string): void;
  selectedId(): string;
  getState(): Visit;
  dispatch(event: VisitEvent): void;
  subscribe(listener: () => void): () => void;
  getChurchPhotos(): ChurchPhotoSet;
  setChurchPhoto(slot: ChurchPhotoSlot, url: string): void;
  clearChurchPhoto(slot: ChurchPhotoSlot): void;
}

export class DemoStore implements ReadyStore {
  private records: VisitRecord[] = seedDemoVisits();
  private list: readonly VisitRecord[] = this.records;
  private selected = this.records[0]?.id ?? '';
  private photos: ChurchPhotoSet = emptyChurchPhotos();
  private readonly listeners = new Set<() => void>();

  listVisits = (): readonly VisitRecord[] => this.list;

  getVisit = (id: string): VisitRecord | null => this.records.find((record) => record.id === id) ?? null;

  select = (id: string): void => {
    if (id === this.selected) return;
    if (!this.records.some((record) => record.id === id)) return;
    this.selected = id;
    this.emit();
  };

  selectedId = (): string => this.selected;

  getState = (): Visit => this.current().visit;

  dispatch = (event: VisitEvent): void => {
    const current = this.current();
    const next = reduceVisit(current.visit, event);
    if (next === current.visit) return;
    const updated: VisitRecord = { ...current, visit: next };
    this.records = this.records.map((record) => (record.id === current.id ? updated : record));
    this.list = this.records;
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

  private current(): VisitRecord {
    const found = this.records.find((record) => record.id === this.selected);
    if (found === undefined) throw new Error('Selected visit is missing.');
    return found;
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
