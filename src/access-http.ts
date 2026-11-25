import type { AccessCommand } from './access.ts';
import { InputError } from './errors.ts';
import { json, readJson } from './http.ts';
import { isRecord } from './schema.ts';
import type { AccessSource } from './supabase-access.ts';
import type { AuthVerifier } from './supabase-auth.ts';

function sessionId(request: Request): string | null {
  const header = request.headers.get('authorization');
  const match = header === null ? null : /^Bearer (\S+)$/.exec(header);
  return match?.[1] ?? null;
}

function requiredString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== 'string' || value.length === 0) throw new InputError();
  return value;
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const value = await readJson(request);
  if (!isRecord(value)) throw new InputError();
  return value;
}

async function commandFor(request: Request, url: URL): Promise<AccessCommand | null> {
  const pathname = url.pathname;
  if (request.method === 'GET' && pathname === '/v1/access/membership') {
    const requested = url.searchParams.get('organizationId');
    return {
      type: 'membership',
      organizationId: requested === null || requested.length === 0 ? null : requested,
    };
  }
  const child = /^\/v1\/access\/children\/([^/]+)$/.exec(pathname);
  if (request.method === 'GET' && child?.[1] !== undefined) return { type: 'child', childId: child[1] };
  const brief = /^\/v1\/access\/briefs\/([^/]+)$/.exec(pathname);
  if (request.method === 'GET' && brief?.[1] !== undefined) return { type: 'brief', briefId: brief[1] };
  const church = /^\/v1\/access\/churches\/([^/]+)$/.exec(pathname);
  if (request.method === 'GET' && church?.[1] !== undefined) {
    return { type: 'church', organizationId: church[1] };
  }
  const lesson = /^\/v1\/access\/lessons\/([^/]+)$/.exec(pathname);
  if (request.method === 'GET' && lesson?.[1] !== undefined) return { type: 'lesson', lessonId: lesson[1] };
  if (request.method === 'POST' && pathname === '/v1/access/medical-grants') {
    const body = await readBody(request);
    return { type: 'grant', childId: requiredString(body, 'childId') };
  }
  if (request.method === 'POST' && pathname === '/v1/access/register') {
    const body = await readBody(request);
    return {
      type: 'register',
      organizationId: requiredString(body, 'organizationId'),
      requestedRole: requiredString(body, 'role'),
    };
  }
  if (request.method === 'POST' && pathname === '/v1/access/invites') {
    const body = await readBody(request);
    return {
      type: 'invite',
      organizationId: requiredString(body, 'organizationId'),
      requestedRole: requiredString(body, 'role'),
    };
  }
  const accept = /^\/v1\/access\/invites\/([^/]+)\/accept$/.exec(pathname);
  if (request.method === 'POST' && accept?.[1] !== undefined) {
    const body = await readBody(request);
    const claimed = body.role;
    if (claimed !== undefined && (typeof claimed !== 'string' || claimed.length === 0)) throw new InputError();
    return { type: 'accept', inviteId: accept[1], claimedRole: typeof claimed === 'string' ? claimed : null };
  }
  return null;
}

export async function handleAccessSource(
  request: Request,
  source: AccessSource,
  verifier: AuthVerifier,
): Promise<Response> {
  const url = new URL(request.url);
  const command = await commandFor(request, url);
  if (command === null) return json({ error: 'not_found' }, 404);
  const token = sessionId(request);
  if (token === null) return json({ error: 'unauthorized' }, 401);
  const user = await verifier.verify(token);
  if (user === null) return json({ error: 'unauthorized' }, 401);
  const result = await source.run({ userId: user.userId, accessToken: token, command });
  return json(result.body, result.status);
}
