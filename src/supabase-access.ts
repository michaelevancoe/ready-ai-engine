import type { AccessCommand, AccessResult, ChurchRole, InviteRole } from './access.ts';
import { deadline } from './deadline.ts';
import { ConfigError, StoreError, UpstreamError } from './errors.ts';
import { isUuid } from './ids.ts';
import { isRecord } from './schema.ts';

export interface AccessCaller {
  userId: string;
  accessToken: string;
  command: AccessCommand;
}

export interface AccessSource {
  run(input: AccessCaller): Promise<AccessResult>;
}

export interface SupabaseAccessOptions {
  supabaseUrl: string;
  anonKey: string;
  fetch: typeof fetch;
  timeoutMs?: number;
}

const MAX_RESPONSE_CHARS = 100_000;
const DEFAULT_TIMEOUT_MS = 10_000;

function forbidden(): AccessResult {
  return { status: 403, body: { error: 'forbidden' } };
}

function notFound(): AccessResult {
  return { status: 404, body: { error: 'not_found' } };
}

function unauthorized(): AccessResult {
  return { status: 401, body: { error: 'unauthorized' } };
}

function isTimeout(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('name' in error)) return false;
  return error.name === 'TimeoutError' || error.name === 'AbortError';
}

function churchRole(value: unknown): ChurchRole | null {
  switch (value) {
    case 'parent':
    case 'volunteer':
    case 'leader':
      return value;
    default:
      return null;
  }
}

function inviteRole(value: string): InviteRole | null {
  switch (value) {
    case 'volunteer':
    case 'leader':
      return value;
    default:
      return null;
  }
}

function baseUrl(supabaseUrl: string): string {
  if (supabaseUrl.trim() === '') throw new ConfigError();
  return supabaseUrl.endsWith('/') ? supabaseUrl : `${supabaseUrl}/`;
}

export function supabaseAccessSource(options: SupabaseAccessOptions): AccessSource {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function call(
    path: string,
    accessToken: string,
    init: { method: string; query?: Record<string, string>; body?: unknown },
  ): Promise<{ status: number; body: unknown }> {
    if (options.anonKey.trim() === '') throw new ConfigError();
    const url = new URL(path, baseUrl(options.supabaseUrl));
    if (init.query !== undefined) {
      for (const [key, value] of Object.entries(init.query)) url.searchParams.set(key, value);
    }
    const headers = new Headers({
      accept: 'application/json',
      apikey: options.anonKey,
      authorization: `Bearer ${accessToken}`,
    });
    let body: string | undefined;
    if (init.body !== undefined) {
      headers.set('content-type', 'application/json');
      body = JSON.stringify(init.body);
    }
    const timer = deadline(timeoutMs);
    let text = '';
    let status = 0;
    try {
      const response = await options.fetch(url, {
        method: init.method,
        headers,
        body,
        signal: timer.signal,
      });
      status = response.status;
      text = await response.text();
    } catch (error) {
      throw new UpstreamError(isTimeout(error) ? 504 : 503);
    } finally {
      timer.done();
    }
    if (text.length > MAX_RESPONSE_CHARS) throw new StoreError(502);
    if (text.length === 0) return { status, body: null };
    try {
      return { status, body: JSON.parse(text) as unknown };
    } catch {
      throw new StoreError(502);
    }
  }

  function rpcFailure(result: { status: number; body: unknown }): AccessResult | null {
    if (result.status < 400) return null;
    if (result.status === 401) return unauthorized();
    if (result.status === 403) return forbidden();
    if (isRecord(result.body) && result.body.code === 'P0001') {
      if (result.body.message === 'forbidden') return forbidden();
      if (result.body.message === 'not_found') return notFound();
    }
    throw new StoreError(result.status);
  }

  async function one(
    table: string,
    accessToken: string,
    query: Record<string, string>,
  ): Promise<Record<string, unknown> | null | AccessResult> {
    const result = await call(`/rest/v1/${table}`, accessToken, {
      method: 'GET',
      query: { ...query, limit: '1' },
    });
    const failure = rpcFailure(result);
    if (failure !== null) return failure;
    if (!Array.isArray(result.body)) throw new StoreError(502);
    const row = result.body[0];
    if (row === undefined) return null;
    if (!isRecord(row)) throw new StoreError(502);
    return row;
  }

  function isResult(value: Record<string, unknown> | null | AccessResult): value is AccessResult {
    return value !== null && 'status' in value && 'body' in value;
  }

  async function rpc(
    name: string,
    accessToken: string,
    args: Record<string, unknown>,
  ): Promise<{ status: number; body: unknown }> {
    return call(`/rest/v1/rpc/${name}`, accessToken, { method: 'POST', body: args });
  }

  async function readMembership(input: AccessCaller): Promise<AccessResult> {
    const row = await one('memberships', input.accessToken, {
      select: 'role',
      user_id: `eq.${input.userId}`,
    });
    if (isResult(row)) return row;
    if (row === null) return notFound();
    const role = churchRole(row.role);
    if (role === null) return notFound();
    return { status: 200, body: { role } };
  }

  async function readChild(input: AccessCaller, childId: string): Promise<AccessResult> {
    if (!isUuid(childId)) return notFound();
    const row = await one('children', input.accessToken, {
      select: 'id,display_name',
      id: `eq.${childId}`,
    });
    if (isResult(row)) return row;
    if (row === null || typeof row.display_name !== 'string' || row.id !== childId) return notFound();
    return { status: 200, body: { id: childId, displayName: row.display_name } };
  }

  async function readBrief(input: AccessCaller, briefId: string): Promise<AccessResult> {
    if (!isUuid(briefId)) return notFound();
    const row = await one('shared_briefs', input.accessToken, {
      select: 'id,child_id,lines',
      id: `eq.${briefId}`,
    });
    if (isResult(row)) return row;
    if (row === null || row.id !== briefId || typeof row.child_id !== 'string' || !isUuid(row.child_id)) {
      return notFound();
    }
    if (!Array.isArray(row.lines)) throw new StoreError(502);
    const lines: { field: string; text: string }[] = [];
    for (const line of row.lines) {
      if (!isRecord(line) || typeof line.field !== 'string' || typeof line.text !== 'string') {
        throw new StoreError(502);
      }
      lines.push({ field: line.field, text: line.text });
    }
    const visible = await rpc('medical_visible', input.accessToken, { target_child: row.child_id });
    const failure = rpcFailure(visible);
    if (failure !== null) return failure;
    if (visible.body !== true && visible.body !== false) throw new StoreError(502);
    const shown = visible.body ? lines : lines.filter((line) => line.field !== 'medical');
    return { status: 200, body: { id: briefId, lines: shown } };
  }

  async function readChurch(input: AccessCaller, organizationId: string): Promise<AccessResult> {
    if (!isUuid(organizationId)) return notFound();
    const row = await one('church_setup', input.accessToken, {
      select: 'organization_id,name',
      organization_id: `eq.${organizationId}`,
    });
    if (isResult(row)) return row;
    if (row === null || row.organization_id !== organizationId || typeof row.name !== 'string') return notFound();
    return { status: 200, body: { organizationId, name: row.name } };
  }

  async function readLesson(input: AccessCaller, lessonId: string): Promise<AccessResult> {
    if (!isUuid(lessonId)) return notFound();
    const row = await one('lessons', input.accessToken, {
      select: 'id,title',
      id: `eq.${lessonId}`,
    });
    if (isResult(row)) return row;
    if (row === null || row.id !== lessonId || typeof row.title !== 'string') return notFound();
    return { status: 200, body: { id: lessonId, title: row.title } };
  }

  async function grant(input: AccessCaller, childId: string): Promise<AccessResult> {
    if (!isUuid(childId)) return notFound();
    const result = await rpc('grant_medical', input.accessToken, { target_child: childId });
    return rpcFailure(result) ?? { status: 200, body: { granted: true } };
  }

  async function register(input: AccessCaller, organizationId: string, requestedRole: string): Promise<AccessResult> {
    if (requestedRole !== 'parent') return forbidden();
    if (!isUuid(organizationId)) return notFound();
    const result = await rpc('self_register_parent', input.accessToken, { target_org: organizationId });
    const failure = rpcFailure(result);
    if (failure !== null) return failure;
    if (result.body === true) return { status: 201, body: { role: 'parent' } };
    if (result.body === false) return { status: 200, body: { role: 'parent' } };
    throw new StoreError(502);
  }

  async function invite(input: AccessCaller, organizationId: string, requestedRole: string): Promise<AccessResult> {
    const role = inviteRole(requestedRole);
    if (role === null || !isUuid(organizationId)) return forbidden();
    const result = await rpc('create_invite', input.accessToken, {
      target_org: organizationId,
      invite_role: role,
    });
    const failure = rpcFailure(result);
    if (failure !== null) return failure;
    if (typeof result.body !== 'string' || !isUuid(result.body)) throw new StoreError(502);
    return { status: 201, body: { id: result.body, role } };
  }

  async function accept(input: AccessCaller, inviteId: string, claimedRole: string | null): Promise<AccessResult> {
    if (!isUuid(inviteId)) return notFound();
    const args: Record<string, unknown> = { invite_id: inviteId };
    if (claimedRole !== null) args.claimed_role = claimedRole;
    const result = await rpc('accept_invite', input.accessToken, args);
    const failure = rpcFailure(result);
    if (failure !== null) return failure;
    if (!isRecord(result.body)) throw new StoreError(502);
    const role = inviteRole(typeof result.body.role === 'string' ? result.body.role : '');
    if (role === null || typeof result.body.created !== 'boolean') throw new StoreError(502);
    return { status: result.body.created ? 201 : 200, body: { role } };
  }

  return {
    async run(input: AccessCaller): Promise<AccessResult> {
      switch (input.command.type) {
        case 'membership':
          return readMembership(input);
        case 'child':
          return readChild(input, input.command.childId);
        case 'brief':
          return readBrief(input, input.command.briefId);
        case 'church':
          return readChurch(input, input.command.organizationId);
        case 'lesson':
          return readLesson(input, input.command.lessonId);
        case 'grant':
          return grant(input, input.command.childId);
        case 'register':
          return register(input, input.command.organizationId, input.command.requestedRole);
        case 'invite':
          return invite(input, input.command.organizationId, input.command.requestedRole);
        case 'accept':
          return accept(input, input.command.inviteId, input.command.claimedRole);
        default: {
          const unreachable: never = input.command;
          throw new Error(String(unreachable));
        }
      }
    },
  };
}
