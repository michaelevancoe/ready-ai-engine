import { ONBOARDING_STORAGE_KEY } from '../lib/leader-onboarding.ts';

export const onboardingDone = { v: 1, status: 'done' } as const;

export function onboardingStorageState(origin: string): {
  cookies: [];
  origins: Array<{
    origin: string;
    localStorage: Array<{ name: string; value: string }>;
  }>;
} {
  return {
    cookies: [],
    origins: [
      {
        origin,
        localStorage: [{ name: ONBOARDING_STORAGE_KEY, value: JSON.stringify(onboardingDone) }],
      },
    ],
  };
}
