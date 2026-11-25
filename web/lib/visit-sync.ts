import type { AccountSession, VisitGateway } from './account-store.ts';

export function visitSyncGateway(): VisitGateway {
  return {
    save(session: AccountSession, scope, plan, epoch) {
      void fetch('/visit-sync', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${session.accessToken}`,
        },
        body: JSON.stringify({ scope, plan, epoch }),
      }).catch(() => undefined);
    },
  };
}
