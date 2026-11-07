export type Role = 'admin' | 'parent' | 'volunteer';

export type ProfileStatus = 'draft' | 'approved';

export type AccessAction =
  | 'intake.create'
  | 'profile.read_draft'
  | 'profile.read_approved'
  | 'profile.approve';

export interface AccessInput {
  action: AccessAction;
  role: Role | null;
  sameOrganization: boolean;
  isChildParent: boolean;
  profileStatus?: ProfileStatus;
}

function assertNever(value: never): never {
  throw new Error(`unexpected value ${String(value)}`);
}

export function authorize(input: AccessInput): boolean {
  if (!input.sameOrganization || input.role === null) return false;

  switch (input.action) {
    case 'intake.create':
      return input.role === 'parent' && input.isChildParent;
    case 'profile.read_draft':
      switch (input.role) {
        case 'volunteer':
          return false;
        case 'admin':
          return true;
        case 'parent':
          return input.isChildParent;
        default:
          return assertNever(input.role);
      }
    case 'profile.read_approved':
      return true;
    case 'profile.approve':
      return (
        input.role === 'parent' &&
        input.isChildParent &&
        input.profileStatus === 'draft'
      );
    default:
      return assertNever(input.action);
  }
}
