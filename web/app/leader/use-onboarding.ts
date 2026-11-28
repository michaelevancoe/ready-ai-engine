'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import {
  createOnboardingStore,
  reduceOnboarding,
  type OnboardingAction,
  type OnboardingState,
  type OnboardingStorage,
} from '../../lib/leader-onboarding';

function browserStorage(): OnboardingStorage | null {
  try {
    if (typeof window === 'undefined') return null;
    const storage = window.localStorage;
    if (typeof storage?.getItem !== 'function' || typeof storage.setItem !== 'function') return null;
    return storage;
  } catch {
    return null;
  }
}

export function useOnboarding(): {
  readonly state: OnboardingState;
  readonly dispatch: (action: OnboardingAction) => void;
} {
  const storeRef = useRef<ReturnType<typeof createOnboardingStore> | null>(null);
  if (storeRef.current === null) storeRef.current = createOnboardingStore(browserStorage());
  const store = storeRef.current;
  const [state, setState] = useState<OnboardingState>({ status: 'new' });
  const written = useRef(false);

  useLayoutEffect(() => {
    if (written.current) return;
    setState(store.read());
  }, [store]);

  const dispatch = useCallback(
    (action: OnboardingAction) => {
      written.current = true;
      setState((current) => {
        const next = reduceOnboarding(current, action);
        store.write(next);
        return next;
      });
    },
    [store],
  );

  return { state, dispatch };
}
