import type { ChildRecord, Membership, NewDraft, ProfileRecord, ProfileStore } from './store.ts';

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
    const record: ProfileRecord = {
      id: crypto.randomUUID(),
      organizationId: input.organizationId,
      childId: input.childId,
      status: 'draft',
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
    const updated: ProfileRecord = { ...current, status: 'approved', approvedBy: input.approvedBy };
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
    { organizationId: ids.org, userId: ids.devon, role: 'leader' },
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
