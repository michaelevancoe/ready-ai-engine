import { emptyPlan, persistDispatch, type AccountScope, type PersistPlan } from './persist-visit.ts';
import {
  emptyChurchPhotos,
  replaceChurchPhoto,
  type ChurchPhotoSet,
  type ChurchPhotoSlot,
  type ReadyStore,
} from './ready-store.ts';
import { reduceVisit, type DemoRole, type Visit, type VisitEvent } from './visit.ts';

export interface AccountSession {
  readonly userId: string;
  readonly accessToken: string;
  readonly role: DemoRole;
}

export interface VisitGateway {
  save(session: AccountSession, scope: AccountScope, plan: PersistPlan, epoch: number): void;
}

export class AccountStore implements ReadyStore {
  private readonly sessions: readonly AccountSession[];
  private readonly scope: AccountScope;
  private readonly gateway: VisitGateway;
  private visit: Visit;
  private photos: ChurchPhotoSet = emptyChurchPhotos();
  private readonly epoch: number;
  private readonly listeners = new Set<() => void>();

  constructor(
    sessions: readonly AccountSession[],
    scope: AccountScope,
    gateway: VisitGateway,
    initial: Visit,
    epoch: number,
  ) {
    this.sessions = sessions;
    this.scope = scope;
    this.gateway = gateway;
    this.visit = initial;
    this.epoch = epoch;
  }

  getState = (): Visit => this.visit;

  dispatch = (event: VisitEvent): void => {
    const next = reduceVisit(this.visit, event);
    if (next === this.visit) return;
    const plan = persistDispatch(this.visit, next, this.scope);
    this.visit = next;
    this.emit();
    this.persist(plan);
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

  private persist(plan: PersistPlan): void {
    if (emptyPlan(plan)) return;
    this.write('parent', parentPlan(plan));
    this.write('volunteer', volunteerPlan(plan));
    this.write('leader', leaderPlan(plan));
  }

  private write(role: DemoRole, plan: PersistPlan | null): void {
    if (plan === null) return;
    const session = this.sessions.find((item) => item.role === role);
    if (session === undefined) return;
    this.gateway.save(session, this.scope, plan, this.epoch);
  }
}

function parentPlan(plan: PersistPlan): PersistPlan | null {
  if (plan.answers === null && plan.brief === null && plan.publication === null) return null;
  return { ...blankPlan(), answers: plan.answers, brief: plan.brief, publication: plan.publication };
}

function volunteerPlan(plan: PersistPlan): PersistPlan | null {
  if (plan.notes === null) return null;
  return { ...blankPlan(), notes: plan.notes };
}

function leaderPlan(plan: PersistPlan): PersistPlan | null {
  if (plan.church === null && plan.lesson === null && plan.update === null) return null;
  return { ...blankPlan(), church: plan.church, lesson: plan.lesson, update: plan.update };
}

function blankPlan(): PersistPlan {
  return {
    answers: null,
    brief: null,
    publication: null,
    notes: null,
    church: null,
    lesson: null,
    update: null,
  };
}
