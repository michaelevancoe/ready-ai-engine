import type { ChildProfile } from './profile.ts';
import type { ProfileStatus, Role } from './policy.ts';

export interface Membership {
  organizationId: string;
  userId: string;
  role: Role;
}

export interface ChildRecord {
  id: string;
  organizationId: string;
  displayName: string;
  parentUserId: string;
}

export interface ProfileRecord {
  id: string;
  organizationId: string;
  childId: string;
  status: ProfileStatus;
  profile: ChildProfile;
  createdBy: string;
  approvedBy: string | null;
}

export interface NewDraft {
  organizationId: string;
  childId: string;
  profile: ChildProfile;
  createdBy: string;
}

export interface ProfileStore {
  getMembership(userId: string, organizationId: string): Promise<Membership | null>;
  getChild(childId: string): Promise<ChildRecord | null>;
  getProfile(profileId: string): Promise<ProfileRecord | null>;
  insertDraft(input: NewDraft): Promise<ProfileRecord>;
  approveProfile(input: { profileId: string; approvedBy: string }): Promise<ProfileRecord | null>;
}
