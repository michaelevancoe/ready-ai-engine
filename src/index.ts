import type { ExportedHandler } from '@cloudflare/workers-types';
import { handleRequest } from './app.ts';
import { emitSafe } from './log.ts';
import { SupabaseStore } from './supabase-store.ts';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, {
      env,
      fetch: globalThis.fetch,
      storeFactory: (accessToken) =>
        new SupabaseStore({
          supabaseUrl: env.SUPABASE_URL,
          anonKey: env.SUPABASE_ANON_KEY,
          accessToken,
          fetch: globalThis.fetch,
        }),
      log: emitSafe,
    });
  },
} satisfies ExportedHandler<Env>;
