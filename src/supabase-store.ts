import { ConfigError, StoreError } from './errors.ts';
import { isUuid } from './ids.ts';
import type { ChildProfile } from './profile.ts';
import { parseChildProfile } from './profile.ts';
import type { ProfileStatus, Role } from './policy.ts';
import { isRecord } from './schema.ts';
import type { ChildRecord, Membership, NewDraft, ProfileRecord, ProfileStore } from './store.ts';

export interface SupabaseStoreOptions {
  supabaseUrl: string;
  anonKey: string;
  accessToken: string;
  fetch: typeof fetch;
}

const MAX_RESPONSE_CHARS = 100_000;

function eq(value: string): string {
  if (!isUuid(value)) throw new StoreError(400);
  return `eq.${value}`;
}

function parseRole(value: unknown): Role {
  switch (value) {
    case 'admin':
    case 'parent':
    case 'volunteer':
      return value;
    default:
      throw new StoreError(502);
  }
}

function parseStatus(value: unknown): ProfileStatus {
  switch (value) {
    case 'draft':
    case 'approved':
      return value;
    default:
      throw new StoreError(502);
  }
}

function firstRow(value: unknown): Record<string, unknown> | null {
  if (!Array.isArray(value)) throw new StoreError(502);
  if (value.length === 0) return null;
  const row = value[0];
  if (!isRecord(row)) throw new StoreError(502);
  return row;
}

function requireString(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value !== 'string' || !isUuid(value)) throw new StoreError(502);
  return value;
}

export class SupabaseStore implements ProfileStore {
  private readonly options: SupabaseStoreOptions;

  constructor(options: SupabaseStoreOptions) {
    this.options = options;
  }

  async getMembership(userId: string, organizationId: string): Promise<Membership | null> {
    const row = firstRow(
      await this.request('memberships', {
        method: 'GET',
        query: {
          select: 'organization_id,user_id,role',
          user_id: eq(userId),
          organization_id: eq(organizationId),
          limit: '1',
        },
      }),
    );
    if (row === null) return null;
    return {
      organizationId: requireString(row, 'organization_id'),
      userId: requireString(row, 'user_id'),
      role: parseRole(row.role),
    };
  }

  async getChild(childId: string): Promise<ChildRecord | null> {
    const row = firstRow(
      await this.request('children', {
        method: 'GET',
        query: {
          select: 'id,organization_id,display_name,parent_user_id',
          id: eq(childId),
          limit: '1',
        },
      }),
    );
    if (row === null) return null;
    if (typeof row.display_name !== 'string') throw new StoreError(502);
    return {
      id: requireString(row, 'id'),
      organizationId: requireString(row, 'organization_id'),
      displayName: row.display_name,
      parentUserId: requireString(row, 'parent_user_id'),
    };
  }

  async getProfile(profileId: string): Promise<ProfileRecord | null> {
    const row = firstRow(
      await this.request('child_profiles', {
        method: 'GET',
        query: {
          select: 'id,organization_id,child_id,status,profile,created_by,approved_by',
          id: eq(profileId),
          limit: '1',
        },
      }),
    );
    if (row === null) return null;
    return this.toProfile(row);
  }

  async insertDraft(input: NewDraft): Promise<ProfileRecord> {
    const row = firstRow(
      await this.request('child_profiles', {
        method: 'POST',
        query: { select: 'id,organization_id,child_id,status,profile,created_by,approved_by' },
        body: {
          organization_id: input.organizationId,
          child_id: input.childId,
          status: 'draft',
          profile: input.profile,
          created_by: input.createdBy,
          approved_by: null,
        },
      }),
    );
    if (row === null) throw new StoreError(502);
    return this.toProfile(row);
  }

  async approveProfile(input: {
    profileId: string;
    approvedBy: string;
  }): Promise<ProfileRecord | null> {
    const row = firstRow(
      await this.request('child_profiles', {
        method: 'PATCH',
        query: {
          select: 'id,organization_id,child_id,status,profile,created_by,approved_by',
          id: eq(input.profileId),
          status: 'eq.draft',
        },
        body: {
          status: 'approved',
          approved_by: input.approvedBy,
        },
      }),
    );
    if (row === null) return null;
    return this.toProfile(row);
  }

  private toProfile(row: Record<string, unknown>): ProfileRecord {
    const status = parseStatus(row.status);
    let profile: ChildProfile;
    try {
      profile = parseChildProfile(row.profile);
    } catch {
      throw new StoreError(502);
    }
    const approvedBy = row.approved_by;
    if (approvedBy !== null && typeof approvedBy !== 'string') throw new StoreError(502);
    if (status === 'draft' && approvedBy !== null) throw new StoreError(502);
    if (status === 'approved' && (typeof approvedBy !== 'string' || !isUuid(approvedBy))) {
      throw new StoreError(502);
    }
    return {
      id: requireString(row, 'id'),
      organizationId: requireString(row, 'organization_id'),
      childId: requireString(row, 'child_id'),
      status,
      profile,
      createdBy: requireString(row, 'created_by'),
      approvedBy,
    };
  }

  private base(): string {
    if (this.options.supabaseUrl.trim() === '' || this.options.anonKey.trim() === '') {
      throw new ConfigError();
    }
    return this.options.supabaseUrl.endsWith('/')
      ? this.options.supabaseUrl
      : `${this.options.supabaseUrl}/`;
  }

  private async request(
    table: string,
    init: { method: string; query: Record<string, string>; body?: unknown },
  ): Promise<unknown> {
    const url = new URL(`/rest/v1/${table}`, this.base());
    for (const [key, value] of Object.entries(init.query)) url.searchParams.set(key, value);
    const headers = new Headers({
      accept: 'application/json',
      apikey: this.options.anonKey,
      authorization: `Bearer ${this.options.accessToken}`,
    });
    let body: string | undefined;
    if (init.body !== undefined) {
      headers.set('content-type', 'application/json');
      headers.set('prefer', 'return=representation');
      body = JSON.stringify(init.body);
    }
    let response: Response;
    try {
      response = await this.options.fetch(url, { method: init.method, headers, body });
    } catch {
      throw new StoreError(503);
    }
    const text = await response.text();
    if (!response.ok || text.length > MAX_RESPONSE_CHARS) throw new StoreError(response.ok ? 502 : response.status);
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new StoreError(502);
    }
  }
}
