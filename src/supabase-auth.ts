import { deadline } from './deadline.ts';
import { UpstreamError } from './errors.ts';
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
  timeoutMs?: number;
}

const MAX_RESPONSE_CHARS = 100_000;
const DEFAULT_TIMEOUT_MS = 10_000;

function isTimeout(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('name' in error)) return false;
  return error.name === 'TimeoutError' || error.name === 'AbortError';
}

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
      const timer = deadline(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      let response: Response;
      let text = '';
      try {
        response = await options.fetch(url, {
          method: 'GET',
          redirect: 'manual',
          signal: timer.signal,
          headers: {
            accept: 'application/json',
            apikey: options.anonKey,
            authorization: `Bearer ${accessToken}`,
          },
        });
        if (response.status !== 200) {
          await response.body?.cancel()?.then(
            () => undefined,
            () => undefined,
          );
          return null;
        }
        text = await response.text();
      } catch (error) {
        throw new UpstreamError(isTimeout(error) ? 504 : 503);
      } finally {
        timer.done();
      }
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
