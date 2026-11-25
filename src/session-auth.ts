import { isUuid } from './ids.ts';
import type { AuthVerifier, VerifiedUser } from './supabase-auth.ts';

const PREFIX = 'session.';

export function sessionToken(userId: string): string {
  return `${PREFIX}${userId}`;
}

export function sessionAuthVerifier(): AuthVerifier {
  return {
    async verify(accessToken: string): Promise<VerifiedUser | null> {
      if (!accessToken.startsWith(PREFIX)) return null;
      const userId = accessToken.slice(PREFIX.length);
      if (!isUuid(userId)) return null;
      return { userId };
    },
  };
}
