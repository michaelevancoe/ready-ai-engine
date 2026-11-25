import { initialVisit, reduceVisit, type Visit, type VisitEvent } from './visit.ts';

export interface ReadyStore {
  getState(): Visit;
  dispatch(event: VisitEvent): void;
  subscribe(listener: () => void): () => void;
}

export class DemoStore implements ReadyStore {
  private visit: Visit = initialVisit();
  private readonly listeners = new Set<() => void>();

  getState = (): Visit => this.visit;

  dispatch = (event: VisitEvent): void => {
    const next = reduceVisit(this.visit, event);
    if (next === this.visit) return;
    this.visit = next;
    for (const listener of this.listeners) listener();
  };

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
}
