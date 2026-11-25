import type { AccessResult, ChurchRole, InviteRole } from './access.ts';
import { isUuid } from './ids.ts';
import type { AccessCaller, AccessSource } from './supabase-access.ts';

export interface MemoryMembership {
  userId: string;
  organizationId: string;
  role: ChurchRole;
}

export interface MemoryChild {
  id: string;
  organizationId: string;
  parentUserId: string;
  displayName: string;
}

export interface MemoryAssignment {
  userId: string;
  organizationId: string;
  roomId: string;
  sundayId: string;
}

export interface MemoryBriefLine {
  field: string;
  text: string;
}

export interface MemoryBrief {
  id: string;
  organizationId: string;
  childId: string;
  roomId: string;
  sundayId: string;
  shared: boolean;
  lines: MemoryBriefLine[];
}

export interface MemoryAccessWorld {
  organizations: { id: string }[];
  memberships: MemoryMembership[];
  children: MemoryChild[];
  assignments: MemoryAssignment[];
  briefs: MemoryBrief[];
  churches: { organizationId: string; name: string }[];
  lessons: { id: string; organizationId: string; title: string }[];
  medicalGrants: { childId: string; granted: boolean }[];
  medicalNotes: { childId: string; note: string }[];
  invites: { id: string; organizationId: string; role: InviteRole }[];
}

export function emptyMemoryAccessWorld(): MemoryAccessWorld {
  return {
    organizations: [],
    memberships: [],
    children: [],
    assignments: [],
    briefs: [],
    churches: [],
    lessons: [],
    medicalGrants: [],
    medicalNotes: [],
    invites: [],
  };
}

function forbidden(): AccessResult {
  return { status: 403, body: { error: 'forbidden' } };
}

function notFound(): AccessResult {
  return { status: 404, body: { error: 'not_found' } };
}

function roleIn(world: MemoryAccessWorld, userId: string, organizationId: string): ChurchRole | null {
  const membership = world.memberships.find(
    (item) => item.userId === userId && item.organizationId === organizationId,
  );
  return membership?.role ?? null;
}

function firstRole(world: MemoryAccessWorld, userId: string): ChurchRole | null {
  return world.memberships.find((item) => item.userId === userId)?.role ?? null;
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

function assigned(
  world: MemoryAccessWorld,
  userId: string,
  brief: MemoryBrief,
): boolean {
  return world.assignments.some(
    (item) =>
      item.userId === userId &&
      item.organizationId === brief.organizationId &&
      item.roomId === brief.roomId &&
      item.sundayId === brief.sundayId,
  );
}

function medicalVisible(world: MemoryAccessWorld, userId: string, childId: string): boolean {
  const child = world.children.find((item) => item.id === childId);
  if (child === undefined) return false;
  if (child.parentUserId === userId && roleIn(world, userId, child.organizationId) === 'parent') return true;
  const granted = world.medicalGrants.find((item) => item.childId === childId)?.granted === true;
  if (!granted) return false;
  return world.briefs.some(
    (brief) =>
      brief.childId === childId &&
      brief.shared &&
      roleIn(world, userId, brief.organizationId) === 'volunteer' &&
      assigned(world, userId, brief),
  );
}

function readMembership(world: MemoryAccessWorld, userId: string): AccessResult {
  const role = firstRole(world, userId);
  if (role === null) return notFound();
  return { status: 200, body: { role } };
}

function readChild(world: MemoryAccessWorld, userId: string, childId: string): AccessResult {
  if (!isUuid(childId)) return notFound();
  const child = world.children.find((item) => item.id === childId);
  if (
    child === undefined ||
    child.parentUserId !== userId ||
    roleIn(world, userId, child.organizationId) !== 'parent'
  ) {
    return notFound();
  }
  return { status: 200, body: { id: child.id, displayName: child.displayName } };
}

function readBrief(world: MemoryAccessWorld, userId: string, briefId: string): AccessResult {
  if (!isUuid(briefId)) return notFound();
  const brief = world.briefs.find((item) => item.id === briefId);
  if (brief === undefined || !brief.shared) return notFound();
  if (roleIn(world, userId, brief.organizationId) !== 'volunteer' || !assigned(world, userId, brief)) {
    return notFound();
  }
  const lines = brief.lines
    .filter((line) => line.field !== 'medical')
    .map((line) => ({ field: line.field, text: line.text }));
  if (medicalVisible(world, userId, brief.childId)) {
    const note = world.medicalNotes.find((item) => item.childId === brief.childId);
    if (note !== undefined) lines.push({ field: 'medical', text: note.note });
  }
  return { status: 200, body: { id: brief.id, lines } };
}

function readChurch(world: MemoryAccessWorld, userId: string, organizationId: string): AccessResult {
  if (!isUuid(organizationId)) return notFound();
  const church = world.churches.find((item) => item.organizationId === organizationId);
  if (church === undefined || roleIn(world, userId, organizationId) !== 'leader') return notFound();
  return { status: 200, body: { organizationId, name: church.name } };
}

function readLesson(world: MemoryAccessWorld, userId: string, lessonId: string): AccessResult {
  if (!isUuid(lessonId)) return notFound();
  const lesson = world.lessons.find((item) => item.id === lessonId);
  if (lesson === undefined || roleIn(world, userId, lesson.organizationId) !== 'leader') return notFound();
  return { status: 200, body: { id: lesson.id, title: lesson.title } };
}

function grantMedical(world: MemoryAccessWorld, userId: string, childId: string): AccessResult {
  if (!isUuid(childId)) return notFound();
  const child = world.children.find((item) => item.id === childId);
  if (child === undefined) return notFound();
  if (child.parentUserId !== userId || roleIn(world, userId, child.organizationId) !== 'parent') {
    return forbidden();
  }
  const existing = world.medicalGrants.find((item) => item.childId === childId);
  if (existing === undefined) world.medicalGrants.push({ childId, granted: true });
  else existing.granted = true;
  return { status: 200, body: { granted: true } };
}

function selfRegister(
  world: MemoryAccessWorld,
  userId: string,
  organizationId: string,
  requestedRole: string,
): AccessResult {
  if (requestedRole !== 'parent') return forbidden();
  if (!isUuid(organizationId) || !world.organizations.some((item) => item.id === organizationId)) {
    return notFound();
  }
  const existing = roleIn(world, userId, organizationId);
  if (existing !== null) {
    if (existing === 'parent') return { status: 200, body: { role: 'parent' } };
    return forbidden();
  }
  world.memberships.push({ userId, organizationId, role: 'parent' });
  return { status: 201, body: { role: 'parent' } };
}

function createInvite(
  world: MemoryAccessWorld,
  userId: string,
  organizationId: string,
  requestedRole: string,
): AccessResult {
  const role = inviteRole(requestedRole);
  if (role === null || !isUuid(organizationId) || roleIn(world, userId, organizationId) !== 'leader') {
    return forbidden();
  }
  const id = crypto.randomUUID();
  world.invites.push({ id, organizationId, role });
  return { status: 201, body: { id, role } };
}

function acceptInvite(
  world: MemoryAccessWorld,
  userId: string,
  inviteId: string,
  claimedRole: string | null,
): AccessResult {
  if (!isUuid(inviteId)) return notFound();
  const invite = world.invites.find((item) => item.id === inviteId);
  if (invite === undefined) return notFound();
  if (claimedRole !== null && claimedRole !== invite.role) return forbidden();
  const existing = roleIn(world, userId, invite.organizationId);
  if (existing !== null) {
    if (existing === invite.role) return { status: 200, body: { role: existing } };
    return forbidden();
  }
  world.memberships.push({ userId, organizationId: invite.organizationId, role: invite.role });
  return { status: 201, body: { role: invite.role } };
}

export function memoryAccessSource(world: MemoryAccessWorld): AccessSource {
  return {
    async run(input: AccessCaller): Promise<AccessResult> {
      const userId = input.userId;
      switch (input.command.type) {
        case 'membership':
          return readMembership(world, userId);
        case 'child':
          return readChild(world, userId, input.command.childId);
        case 'brief':
          return readBrief(world, userId, input.command.briefId);
        case 'church':
          return readChurch(world, userId, input.command.organizationId);
        case 'lesson':
          return readLesson(world, userId, input.command.lessonId);
        case 'grant':
          return grantMedical(world, userId, input.command.childId);
        case 'register':
          return selfRegister(world, userId, input.command.organizationId, input.command.requestedRole);
        case 'invite':
          return createInvite(world, userId, input.command.organizationId, input.command.requestedRole);
        case 'accept':
          return acceptInvite(world, userId, input.command.inviteId, input.command.claimedRole);
        default: {
          const unreachable: never = input.command;
          throw new Error(String(unreachable));
        }
      }
    },
  };
}
