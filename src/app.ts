import { handleAccessSource } from './access-http.ts';
import { signInEnabled } from './access.ts';
import type { WorkerBindings } from './bindings.ts';
import { ConfigError, GenerateError, InputError, StoreError, UpstreamError } from './errors.ts';
import { generate } from './generate.ts';
import { json, readJson } from './http.ts';
import { isUuid } from './ids.ts';
import { intakeMessages, parseIntake } from './intake.ts';
import type { SafeLog } from './log.ts';
import { authorize } from './policy.ts';
import { childProfileSchema, childProfileSchemaName, parseChildProfile } from './profile.ts';
import { filterWhatHelps } from './what-helps.ts';
import type { ProfileRecord, ProfileStore } from './store.ts';
import type { AccessSource } from './supabase-access.ts';
import type { AuthVerifier } from './supabase-auth.ts';

export interface AppDeps {
  env: WorkerBindings;
  fetch: typeof fetch;
  storeFactory: (accessToken: string) => ProfileStore;
  log: (event: SafeLog) => void;
  now?: () => number;
  accessSource?: AccessSource;
  auth?: AuthVerifier;
}

interface Authenticated {
  userId: string;
  accessToken: string;
}

function requireSupabase(env: WorkerBindings): void {
  if (env.SUPABASE_URL.trim() === '' || env.SUPABASE_ANON_KEY.trim() === '') throw new ConfigError();
}

function present(record: ProfileRecord): {
  id: string;
  organizationId: string;
  childId: string;
  status: ProfileRecord['status'];
  profile: ProfileRecord['profile'];
  approvedBy: string | null;
} {
  const kept = filterWhatHelps(record.profile.whatHelps);
  return {
    id: record.id,
    organizationId: record.organizationId,
    childId: record.childId,
    status: record.status,
    profile: { ...record.profile, whatHelps: kept.length >= 3 ? [...kept] : [] },
    approvedBy: record.approvedBy,
  };
}

async function authenticate(request: Request, deps: AppDeps): Promise<Authenticated | Response> {
  const header = request.headers.get('authorization');
  const match = header === null ? null : /^Bearer (\S+)$/.exec(header);
  const token = match?.[1];
  if (token === undefined || deps.auth === undefined) return json({ error: 'unauthorized' }, 401);
  const user = await deps.auth.verify(token);
  if (user === null) return json({ error: 'unauthorized' }, 401);
  return { userId: user.userId, accessToken: token };
}

async function handleIntake(request: Request, deps: AppDeps): Promise<Response> {
  requireSupabase(deps.env);
  const auth = await authenticate(request, deps);
  if (auth instanceof Response) return auth;
  const intake = parseIntake(await readJson(request));
  if (intake === null) return json({ error: 'invalid_input' }, 400);

  const store = deps.storeFactory(auth.accessToken);
  const child = await store.getChild(intake.childId);
  if (child === null || child.organizationId !== intake.organizationId) {
    return json({ error: 'not_found' }, 404);
  }
  const membership = await store.getMembership(auth.userId, intake.organizationId);
  if (membership === null) return json({ error: 'not_found' }, 404);
  const allowed = authorize({
    action: 'intake.create',
    role: membership.role,
    sameOrganization: true,
    isChildParent: child.parentUserId === auth.userId,
  });
  if (!allowed) return json({ error: 'forbidden' }, 403);

  const profile = await generate({
    endpoint: 'intake.profile',
    messages: intakeMessages(intake.answers),
    schemaName: childProfileSchemaName,
    schema: childProfileSchema,
    parse: parseChildProfile,
    env: deps.env,
    fetch: deps.fetch,
    log: deps.log,
    maxTokens: 256,
  });
  const saved = await store.insertDraft({
    organizationId: intake.organizationId,
    childId: intake.childId,
    profile,
    createdBy: auth.userId,
  });
  return json(present(saved), 201);
}

async function handleApprove(request: Request, deps: AppDeps, profileId: string): Promise<Response> {
  if (!isUuid(profileId)) return json({ error: 'not_found' }, 404);
  requireSupabase(deps.env);
  const auth = await authenticate(request, deps);
  if (auth instanceof Response) return auth;

  const store = deps.storeFactory(auth.accessToken);
  const profile = await store.getProfile(profileId);
  if (profile === null) return json({ error: 'not_found' }, 404);
  const membership = await store.getMembership(auth.userId, profile.organizationId);
  if (membership === null) return json({ error: 'not_found' }, 404);
  const child = await store.getChild(profile.childId);
  const isChildParent =
    child !== null &&
    child.parentUserId === auth.userId &&
    child.organizationId === profile.organizationId;

  if (profile.status === 'approved') {
    const parentOfChild = authorize({
      action: 'profile.approve',
      role: membership.role,
      sameOrganization: true,
      isChildParent,
      profileStatus: 'draft',
    });
    if (parentOfChild) return json({ error: 'already_approved' }, 409);
    return json({ error: 'forbidden' }, 403);
  }

  const allowed = authorize({
    action: 'profile.approve',
    role: membership.role,
    sameOrganization: true,
    isChildParent,
    profileStatus: profile.status,
  });
  if (!allowed) return json({ error: 'forbidden' }, 403);
  const updated = await store.approveProfile({ profileId, approvedBy: auth.userId });
  if (updated === null) return json({ error: 'already_approved' }, 409);
  return json(present(updated), 200);
}

async function route(request: Request, deps: AppDeps): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname.startsWith('/v1/access/')) {
    if (!signInEnabled(deps.env.READY_SIGN_IN)) return json({ error: 'not_found' }, 404);
    if (deps.accessSource === undefined || deps.auth === undefined) throw new ConfigError();
    return handleAccessSource(request, deps.accessSource, deps.auth);
  }
  if (request.method !== 'POST') return json({ error: 'not_found' }, 404);
  if (url.pathname === '/v1/intake/profile') return handleIntake(request, deps);
  const approve = /^\/v1\/profiles\/([^/]+)\/approve$/.exec(url.pathname);
  const profileId = approve?.[1];
  if (profileId !== undefined) return handleApprove(request, deps, profileId);
  return json({ error: 'not_found' }, 404);
}

export async function handleRequest(request: Request, deps: AppDeps): Promise<Response> {
  try {
    return await route(request, deps);
  } catch (error) {
    if (error instanceof InputError) return json({ error: 'invalid_input' }, 400);
    if (error instanceof ConfigError) return json({ error: 'misconfigured' }, 500);
    if (error instanceof UpstreamError) {
      return json({ error: error.status === 504 ? 'timeout' : 'unavailable' }, error.status);
    }
    if (error instanceof GenerateError) return json({ error: 'generation_failed' }, 502);
    if (error instanceof StoreError) {
      if (error.status === 401 || error.status === 403) return json({ error: 'forbidden' }, 403);
      return json({ error: 'request_failed' }, 500);
    }
    console.error(JSON.stringify({ outcome: 'error', message: 'request failed' }));
    return json({ error: 'request_failed' }, 500);
  }
}
