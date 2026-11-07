import type { WorkerBindings } from '../src/bindings.ts';
import { signHs256 } from '../src/jwt.ts';
import type { ChildProfile } from '../src/profile.ts';
import type { ChildRecord, Membership, NewDraft, ProfileRecord, ProfileStore } from '../src/store.ts';

export const ids = {
  org: '10000000-0000-4000-8000-000000000001',
  otherOrg: '10000000-0000-4000-8000-000000000002',
  avery: '10000000-0000-4000-8000-000000000011',
  blake: '10000000-0000-4000-8000-000000000012',
  cameron: '10000000-0000-4000-8000-000000000013',
  devon: '10000000-0000-4000-8000-000000000014',
  outsider: '10000000-0000-4000-8000-000000000015',
  rowan: '10000000-0000-4000-8000-000000000021',
  quinn: '10000000-0000-4000-8000-000000000022',
  draftProfile: '10000000-0000-4000-8000-000000000031',
};

export const testEnv: WorkerBindings = {
  AI_GATEWAY_BASE_URL: 'https://gateway.example.com/v1',
  AI_GATEWAY_ACCOUNT_ID: 'dummy-account-not-real',
  AI_GATEWAY_ID: 'dummy-gateway-not-real',
  AI_GATEWAY_TOKEN: 'dummy-gateway-token-not-real',
  SUPABASE_URL: 'https://dummy-project-not-real.example.com',
  SUPABASE_ANON_KEY: 'dummy-anon-key-not-real',
  SUPABASE_JWT_SECRET: 'dummy-jwt-secret-not-real',
  INTAKE_PROFILE_PROVIDER: 'openai',
  INTAKE_PROFILE_MODEL: 'dummy-primary-model-not-real',
  INTAKE_PROFILE_FALLBACK_PROVIDER: 'workers-ai',
  INTAKE_PROFILE_FALLBACK_MODEL: 'dummy-fallback-model-not-real',
};

export const nowMs = 1_700_000_000_000;

export function sampleProfile(): ChildProfile {
  return {
    summary: 'Prefers a quiet corner.',
    sensoryConsiderations: ['loud music'],
    supportStrategies: ['offer a quiet seat'],
    avoid: ['surprises'],
    volunteerGuidance: 'Explain the next activity first.',
  };
}

export function chatEnvelope(content: unknown, status = 200): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { role: 'assistant', content: JSON.stringify(content) } }],
    }),
    { status, headers: { 'content-type': 'application/json' } },
  );
}

export async function bearer(userId: string): Promise<string> {
  const token = await signHs256(
    { sub: userId, exp: Math.floor(nowMs / 1000) + 3600 },
    testEnv.SUPABASE_JWT_SECRET,
  );
  return `Bearer ${token}`;
}

export class MemoryStore implements ProfileStore {
  readonly memberships: Membership[] = [];
  readonly children = new Map<string, ChildRecord>();
  readonly profiles = new Map<string, ProfileRecord>();
  readonly tokens: string[] = [];

  async getMembership(userId: string, organizationId: string): Promise<Membership | null> {
    return (
      this.memberships.find(
        (membership) => membership.userId === userId && membership.organizationId === organizationId,
      ) ?? null
    );
  }

  async getChild(childId: string): Promise<ChildRecord | null> {
    return this.children.get(childId) ?? null;
  }

  async getProfile(profileId: string): Promise<ProfileRecord | null> {
    return this.profiles.get(profileId) ?? null;
  }

  async insertDraft(input: NewDraft): Promise<ProfileRecord> {
    const record = {
      id: crypto.randomUUID(),
      organizationId: input.organizationId,
      childId: input.childId,
      status: 'draft' as const,
      profile: input.profile,
      createdBy: input.createdBy,
      approvedBy: null,
    };
    this.profiles.set(record.id, record);
    return record;
  }

  async approveProfile(input: {
    profileId: string;
    approvedBy: string;
  }): Promise<ProfileRecord | null> {
    const current = this.profiles.get(input.profileId);
    if (current === undefined || current.status !== 'draft') return null;
    const updated = { ...current, status: 'approved' as const, approvedBy: input.approvedBy };
    this.profiles.set(updated.id, updated);
    return updated;
  }
}

export function churchStore(): MemoryStore {
  const store = new MemoryStore();
  store.memberships.push(
    { organizationId: ids.org, userId: ids.avery, role: 'parent' },
    { organizationId: ids.org, userId: ids.blake, role: 'parent' },
    { organizationId: ids.org, userId: ids.cameron, role: 'volunteer' },
    { organizationId: ids.org, userId: ids.devon, role: 'admin' },
    { organizationId: ids.otherOrg, userId: ids.outsider, role: 'parent' },
  );
  store.children.set(ids.rowan, {
    id: ids.rowan,
    organizationId: ids.org,
    displayName: 'Rowan Sampleton',
    parentUserId: ids.avery,
  });
  store.children.set(ids.quinn, {
    id: ids.quinn,
    organizationId: ids.org,
    displayName: 'Quinn Placeholder',
    parentUserId: ids.blake,
  });
  return store;
}

export function intakeBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    organizationId: ids.org,
    childId: ids.rowan,
    answers: {
      preferredName: 'Rowan',
      ageYears: 7,
      sensoryNotes: 'SENSORY-NOTE-ORANGE-BLOCK',
      supportNeeds: 'A quiet seat near the door.',
      whatHelps: 'A warning before music.',
      whatToAvoid: 'Surprise loud songs.',
    },
    ...overrides,
  };
}
