import { AccountStore, type AccountSession } from './account-store.ts';
import type { AccountScope } from './persist-visit.ts';
import { DemoStore, type ReadyStore } from './ready-store.ts';
import type { Visit } from './visit.ts';
import { visitSyncGateway } from './visit-sync.ts';

export type StoreBoot =
  | { readonly mode: 'demo' }
  | {
      readonly mode: 'account';
      readonly sessions: readonly AccountSession[];
      readonly scope: AccountScope;
      readonly initial: Visit;
      readonly epoch: number;
    };

export function selectReadyStore(boot: StoreBoot): ReadyStore {
  switch (boot.mode) {
    case 'demo':
      return new DemoStore();
    case 'account':
      return new AccountStore(boot.sessions, boot.scope, visitSyncGateway(), boot.initial, boot.epoch);
    default: {
      const leftover: never = boot;
      return leftover;
    }
  }
}

export function demoMode(boot: StoreBoot): boolean {
  return boot.mode === 'demo';
}
