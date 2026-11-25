import { readLocalApi } from './local-api.ts';
import { parseSyncBody, userIdFromAuthorization, visitWrites, type VisitWrite } from './visit-writes.ts';

export async function syncVisit(request: Request): Promise<Response> {
  const local = readLocalApi();
  if (local === null) return Response.json({ error: 'not_found' }, { status: 404 });
  const header = request.headers.get('authorization');
  const userId = userIdFromAuthorization(header);
  const token = bearer(header);
  if (userId === null || token === null) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const parsed = parseSyncBody(await readBody(request));
  if (parsed === null) return Response.json({ error: 'bad_request' }, { status: 400 });
  const writes = visitWrites(userId, parsed.scope, parsed.plan);
  for (const write of writes) {
    let response: Response;
    try {
      response = await fetch(writeUrl(local.apiUrl, write), {
        method: write.method,
        headers: writeHeaders(local.anonKey, token, write),
        body: write.method === 'POST' ? JSON.stringify(write.row) : undefined,
      });
    } catch {
      return Response.json({ error: 'unavailable' }, { status: 503 });
    }
    if (!response.ok) return Response.json({ error: 'write_failed' }, { status: response.status });
  }
  return new Response(null, { status: 204 });
}

function bearer(header: string | null): string | null {
  if (header === null) return null;
  const match = /^Bearer (\S+)$/.exec(header);
  return match?.[1] ?? null;
}

async function readBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function writeUrl(apiUrl: string, write: VisitWrite): string {
  if (write.method === 'DELETE') return `${apiUrl}/rest/v1/${write.table}?${write.query}`;
  return `${apiUrl}/rest/v1/${write.table}?on_conflict=${encodeURIComponent(write.conflict)}`;
}

function writeHeaders(anonKey: string, token: string, write: VisitWrite): Headers {
  const headers = new Headers({
    accept: 'application/json',
    apikey: anonKey,
    authorization: `Bearer ${token}`,
  });
  if (write.method === 'POST') {
    headers.set('content-type', 'application/json');
    headers.set('prefer', 'resolution=merge-duplicates,return=minimal');
  }
  return headers;
}
