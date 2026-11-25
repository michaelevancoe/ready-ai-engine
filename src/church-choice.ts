import type { AccessResult, ChurchRole } from './access.ts';

export interface ChurchMembership {
  readonly organizationId: string;
  readonly role: ChurchRole;
}

export type ChurchChoice =
  | { readonly status: 'chosen'; readonly organizationId: string; readonly role: ChurchRole }
  | { readonly status: 'choose' }
  | { readonly status: 'none' }
  | { readonly status: 'mismatch' };

export function chooseChurch(
  memberships: readonly ChurchMembership[],
  requestedOrganizationId: string | null,
): ChurchChoice {
  if (memberships.length === 0) return { status: 'none' };
  if (requestedOrganizationId !== null) {
    const match = memberships.find((item) => item.organizationId === requestedOrganizationId);
    if (match === undefined) return { status: 'mismatch' };
    return { status: 'chosen', organizationId: match.organizationId, role: match.role };
  }
  const only = memberships.length === 1 ? memberships[0] : undefined;
  if (only !== undefined) return { status: 'chosen', organizationId: only.organizationId, role: only.role };
  return { status: 'choose' };
}

export function membershipResult(choice: ChurchChoice): AccessResult {
  switch (choice.status) {
    case 'chosen':
      return { status: 200, body: { role: choice.role } };
    case 'choose':
      return { status: 409, body: { error: 'church_required' } };
    case 'none':
    case 'mismatch':
      return { status: 404, body: { error: 'not_found' } };
    default: {
      const leftover: never = choice;
      throw new Error(String(leftover));
    }
  }
}
