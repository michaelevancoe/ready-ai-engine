export type ChurchRole = 'parent' | 'volunteer' | 'leader';

export type InviteRole = 'volunteer' | 'leader';

export interface BriefLine {
  field: string;
  text: string;
}

export type AccessCommand =
  | { type: 'membership'; organizationId: string | null }
  | { type: 'child'; childId: string }
  | { type: 'brief'; briefId: string }
  | { type: 'church'; organizationId: string }
  | { type: 'lesson'; lessonId: string }
  | { type: 'grant'; childId: string }
  | { type: 'register'; organizationId: string; requestedRole: string }
  | { type: 'invite'; organizationId: string; requestedRole: string }
  | { type: 'accept'; inviteId: string; claimedRole: string | null };

export type AccessResult =
  | { status: 200; body: { role: ChurchRole } | { granted: true } | ChildBody | BriefBody | ChurchBody | LessonBody }
  | { status: 201; body: { role: ChurchRole } | { id: string; role: InviteRole } }
  | { status: 401; body: { error: 'unauthorized' } }
  | { status: 403; body: { error: 'forbidden' } }
  | { status: 404; body: { error: 'not_found' } }
  | { status: 409; body: { error: 'church_required' } };

interface ChildBody {
  id: string;
  displayName: string;
}

interface BriefBody {
  id: string;
  lines: BriefLine[];
}

interface ChurchBody {
  organizationId: string;
  name: string;
}

interface LessonBody {
  id: string;
  title: string;
}

export function signInEnabled(value: string | undefined): boolean {
  return value === 'on';
}
