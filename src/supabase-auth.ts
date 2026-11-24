import { isUuid } from './ids.ts';
import { isRecord } from './schema.ts';

export interface VerifiedUser {
  userId: string;
}

export interface AuthVerifier {
  verify(accessToken: string): Promise<VerifiedUser | null>;
}

export interface SupabaseAuthOptions {
  supabaseUrl: string;
  anonKey: string;
  fetch: typeof fetch;
}

const MAX_RESPONSE_CHARS = 100_000;

function userIdFrom(body: unknown): string | null {
  if (!isRecord(body)) return null;
  const id = body.id;
  if (typeof id !== 'string' || !isUuid(id)) return null;
  return id;
}

export function supabaseAuthVerifier(options: SupabaseAuthOptions): AuthVerifier {
  return {
    async verify(accessToken: string): Promise<VerifiedUser | null> {
      if (options.supabaseUrl.trim() === '' || options.anonKey.trim() === '' || accessToken.trim() === '') {
        return null;
      }
      let url: URL;
      try {
        const base = options.supabaseUrl.endsWith('/') ? options.supabaseUrl : `${options.supabaseUrl}/`;
        url = new URL('/auth/v1/user', base);
      } catch {
        return null;
      }
      let response: Response;
      try {
        response = await options.fetch(url, {
          method: 'GET',
          redirect: 'manual',
          headers: {
            accept: 'application/json',
            apikey: options.anonKey,
            authorization: `Bearer ${accessToken}`,
          },
        });
      } catch {
        return null;
      }
      if (response.status !== 200) {
        await response.body?.cancel();
        return null;
      }
      const text = await response.text();
      if (text.length > MAX_RESPONSE_CHARS) return null;
      try {
        const userId = userIdFrom(JSON.parse(text) as unknown);
        return userId === null ? null : { userId };
      } catch {
        return null;
      }
    },
  };
}
