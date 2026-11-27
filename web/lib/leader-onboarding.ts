export const ONBOARDING_STORAGE_KEY = 'ready.leaderOnboarding.v1';

export type OnboardingStep = 1 | 2 | 3 | 4;

export type OnboardingState =
  | { readonly status: 'new' }
  | { readonly status: 'in-progress'; readonly step: OnboardingStep }
  | { readonly status: 'finish' }
  | { readonly status: 'skipped'; readonly step: OnboardingStep }
  | { readonly status: 'done' };

export type OnboardingAction =
  | { readonly type: 'start' }
  | { readonly type: 'next' }
  | { readonly type: 'back' }
  | { readonly type: 'skip' }
  | { readonly type: 'resume' }
  | { readonly type: 'finish' }
  | { readonly type: 'replay' };

export interface OnboardingStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const welcome: OnboardingState = { status: 'new' };

export function reduceOnboarding(state: OnboardingState, action: OnboardingAction): OnboardingState {
  switch (action.type) {
    case 'start':
      return start(state);
    case 'next':
      return next(state);
    case 'back':
      return back(state);
    case 'skip':
      return skip(state);
    case 'resume':
      return resume(state);
    case 'finish':
      return finish(state);
    case 'replay':
      return welcome;
    default: {
      const leftover: never = action;
      return leftover;
    }
  }
}

export function onboardingProgress(state: OnboardingState): { readonly step: OnboardingStep; readonly of: 4 } | null {
  switch (state.status) {
    case 'new':
      return { step: 1, of: 4 };
    case 'in-progress':
    case 'skipped':
      return { step: state.step, of: 4 };
    case 'finish':
    case 'done':
      return null;
    default: {
      const leftover: never = state;
      return leftover;
    }
  }
}

export function familyStartLink(origin: string): string {
  return new URL('/', origin).href;
}

export function volunteerStartLink(origin: string): string {
  return new URL('/volunteer', origin).href;
}

export function createOnboardingStore(storage: OnboardingStorage | null): {
  read(): OnboardingState;
  write(state: OnboardingState): void;
} {
  let memory: OnboardingState | null = null;

  return {
    read() {
      if (memory !== null) return memory;
      memory = readStored(storage);
      return memory;
    },
    write(state) {
      memory = state;
      if (storage === null) return;
      try {
        storage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(persist(state)));
      } catch {
        return;
      }
    },
  };
}

function start(state: OnboardingState): OnboardingState {
  if (state.status === 'new' || (state.status === 'in-progress' && state.step === 1)) {
    return { status: 'in-progress', step: 2 };
  }
  return state;
}

function next(state: OnboardingState): OnboardingState {
  if (state.status !== 'in-progress') return state;
  switch (state.step) {
    case 1:
      return { status: 'in-progress', step: 2 };
    case 2:
      return { status: 'in-progress', step: 3 };
    case 3:
      return { status: 'in-progress', step: 4 };
    case 4:
      return { status: 'finish' };
    default: {
      const leftover: never = state.step;
      return leftover;
    }
  }
}

function back(state: OnboardingState): OnboardingState {
  if (state.status === 'finish') return { status: 'in-progress', step: 4 };
  if (state.status !== 'in-progress') return state;
  switch (state.step) {
    case 1:
      return state;
    case 2:
      return { status: 'in-progress', step: 1 };
    case 3:
      return { status: 'in-progress', step: 2 };
    case 4:
      return { status: 'in-progress', step: 3 };
    default: {
      const leftover: never = state.step;
      return leftover;
    }
  }
}

function skip(state: OnboardingState): OnboardingState {
  switch (state.status) {
    case 'new':
      return { status: 'skipped', step: 1 };
    case 'in-progress':
      return { status: 'skipped', step: state.step };
    case 'finish':
    case 'skipped':
    case 'done':
      return state;
    default: {
      const leftover: never = state;
      return leftover;
    }
  }
}

function resume(state: OnboardingState): OnboardingState {
  if (state.status !== 'skipped') return state;
  return { status: 'in-progress', step: state.step };
}

function finish(state: OnboardingState): OnboardingState {
  if (state.status === 'finish' || state.status === 'skipped') return { status: 'done' };
  return state;
}

function persist(state: OnboardingState): { readonly v: 1; readonly status: OnboardingState['status']; readonly step?: OnboardingStep } {
  switch (state.status) {
    case 'new':
    case 'finish':
    case 'done':
      return { v: 1, status: state.status };
    case 'in-progress':
    case 'skipped':
      return { v: 1, status: state.status, step: state.step };
    default: {
      const leftover: never = state;
      return leftover;
    }
  }
}

function readStored(storage: OnboardingStorage | null): OnboardingState {
  if (storage === null) return welcome;
  try {
    return parseStored(storage.getItem(ONBOARDING_STORAGE_KEY));
  } catch {
    return welcome;
  }
}

function parseStored(raw: string | null): OnboardingState {
  if (raw === null || raw === '') return welcome;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return welcome;
  }
  if (!isRecord(value) || value.v !== 1) return welcome;
  const status = value.status;
  if (status === 'new' || status === 'finish' || status === 'done') return { status };
  if ((status === 'in-progress' || status === 'skipped') && isStep(value.step)) return { status, step: value.step };
  return welcome;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStep(value: unknown): value is OnboardingStep {
  return value === 1 || value === 2 || value === 3 || value === 4;
}
