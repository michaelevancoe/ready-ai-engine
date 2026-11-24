export type ChurchRole = 'parent' | 'volunteer' | 'leader';

export type InviteRole = 'volunteer' | 'leader';

export interface Session {
  sessionId: string;
  userId: string;
}

export interface Membership {
  userId: string;
  organizationId: string;
  role: ChurchRole;
}

export interface ChildRow {
  id: string;
  organizationId: string;
  parentUserId: string;
  displayName: string;
}

export interface Assignment {
  userId: string;
  organizationId: string;
  roomId: string;
  sundayId: string;
}

export interface BriefLine {
  field: string;
  text: string;
}

export interface BriefRow {
  id: string;
  organizationId: string;
  childId: string;
  roomId: string;
  sundayId: string;
  shared: boolean;
  lines: BriefLine[];
}

export interface ChurchRow {
  organizationId: string;
  name: string;
}

export interface LessonRow {
  id: string;
  organizationId: string;
  title: string;
}

export interface InviteRow {
  id: string;
  organizationId: string;
  role: InviteRole;
}

export interface MedicalGrant {
  childId: string;
  granted: boolean;
}

export interface AccessWorld {
  sessions: Session[];
  memberships: Membership[];
  children: ChildRow[];
  assignments: Assignment[];
  briefs: BriefRow[];
  churches: ChurchRow[];
  lessons: LessonRow[];
  medicalGrants: MedicalGrant[];
  invites: InviteRow[];
}

export type AccessCommand =
  | { type: 'membership' }
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
  | { status: 404; body: { error: 'not_found' } };

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

interface ParentActor {
  role: 'parent';
  userId: string;
  organizationId: string;
}

interface VolunteerActor {
  role: 'volunteer';
  userId: string;
  organizationId: string;
  roomId: string | null;
  sundayId: string | null;
}

interface LeaderActor {
  role: 'leader';
  userId: string;
  organizationId: string;
}

type Actor = ParentActor | VolunteerActor | LeaderActor;

function assertNever(value: never): never {
  throw new Error(`unexpected value ${String(value)}`);
}

export function signInEnabled(value: string | undefined): boolean {
  return value === 'on';
}

function unauthorized(): AccessResult {
  return { status: 401, body: { error: 'unauthorized' } };
}

function forbidden(): AccessResult {
  return { status: 403, body: { error: 'forbidden' } };
}

function notFound(): AccessResult {
  return { status: 404, body: { error: 'not_found' } };
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

function actorOf(world: AccessWorld, userId: string): Actor | null {
  const membership = world.memberships.find((item) => item.userId === userId);
  if (membership === undefined) return null;
  switch (membership.role) {
    case 'parent':
      return { role: 'parent', userId, organizationId: membership.organizationId };
    case 'volunteer': {
      const assignment = world.assignments.find(
        (item) => item.userId === userId && item.organizationId === membership.organizationId,
      );
      return {
        role: 'volunteer',
        userId,
        organizationId: membership.organizationId,
        roomId: assignment?.roomId ?? null,
        sundayId: assignment?.sundayId ?? null,
      };
    }
    case 'leader':
      return { role: 'leader', userId, organizationId: membership.organizationId };
    default:
      return assertNever(membership.role);
  }
}

function readChild(world: AccessWorld, actor: Actor | null, childId: string): AccessResult {
  const child = world.children.find((item) => item.id === childId);
  if (child === undefined || actor === null || actor.role !== 'parent') return notFound();
  if (actor.organizationId !== child.organizationId || actor.userId !== child.parentUserId) return notFound();
  return { status: 200, body: { id: child.id, displayName: child.displayName } };
}

function medicalGranted(world: AccessWorld, childId: string): boolean {
  return world.medicalGrants.find((grant) => grant.childId === childId)?.granted === true;
}

function readBrief(world: AccessWorld, actor: Actor | null, briefId: string): AccessResult {
  const brief = world.briefs.find((item) => item.id === briefId);
  if (brief === undefined || actor === null || actor.role !== 'volunteer') return notFound();
  if (actor.organizationId !== brief.organizationId || !brief.shared) return notFound();
  if (actor.roomId !== brief.roomId || actor.sundayId !== brief.sundayId) return notFound();
  const granted = medicalGranted(world, brief.childId);
  const lines = brief.lines
    .filter((line) => granted || line.field !== 'medical')
    .map((line) => ({ field: line.field, text: line.text }));
  return { status: 200, body: { id: brief.id, lines } };
}

function readChurch(world: AccessWorld, actor: Actor | null, organizationId: string): AccessResult {
  const church = world.churches.find((item) => item.organizationId === organizationId);
  if (church === undefined || actor === null || actor.role !== 'leader') return notFound();
  if (actor.organizationId !== church.organizationId) return notFound();
  return { status: 200, body: { organizationId: church.organizationId, name: church.name } };
}

function readLesson(world: AccessWorld, actor: Actor | null, lessonId: string): AccessResult {
  const lesson = world.lessons.find((item) => item.id === lessonId);
  if (lesson === undefined || actor === null || actor.role !== 'leader') return notFound();
  if (actor.organizationId !== lesson.organizationId) return notFound();
  return { status: 200, body: { id: lesson.id, title: lesson.title } };
}

function grantMedical(world: AccessWorld, actor: Actor | null, childId: string): AccessResult {
  const child = world.children.find((item) => item.id === childId);
  if (child === undefined) return notFound();
  if (actor === null || actor.role !== 'parent') return forbidden();
  if (actor.userId !== child.parentUserId || actor.organizationId !== child.organizationId) return forbidden();
  const existing = world.medicalGrants.find((grant) => grant.childId === childId);
  if (existing === undefined) world.medicalGrants.push({ childId, granted: true });
  else existing.granted = true;
  return { status: 200, body: { granted: true } };
}

function selfRegister(
  world: AccessWorld,
  userId: string,
  organizationId: string,
  requestedRole: string,
): AccessResult {
  if (requestedRole !== 'parent') return forbidden();
  const church = world.churches.find((item) => item.organizationId === organizationId);
  if (church === undefined) return notFound();
  const existing = world.memberships.find(
    (item) => item.userId === userId && item.organizationId === organizationId,
  );
  if (existing !== undefined) {
    if (existing.role === 'parent') return { status: 200, body: { role: 'parent' } };
    return forbidden();
  }
  world.memberships.push({ userId, organizationId, role: 'parent' });
  return { status: 201, body: { role: 'parent' } };
}

function createInvite(
  world: AccessWorld,
  actor: Actor | null,
  organizationId: string,
  requestedRole: string,
): AccessResult {
  const role = inviteRole(requestedRole);
  if (actor === null || actor.role !== 'leader' || actor.organizationId !== organizationId || role === null) {
    return forbidden();
  }
  const id = `invite-${String(world.invites.length + 1)}`;
  world.invites.push({ id, organizationId, role });
  return { status: 201, body: { id, role } };
}

function acceptInvite(
  world: AccessWorld,
  userId: string,
  inviteId: string,
  claimedRole: string | null,
): AccessResult {
  const invite = world.invites.find((item) => item.id === inviteId);
  if (invite === undefined) return notFound();
  if (claimedRole !== null && claimedRole !== invite.role) return forbidden();
  const existing = world.memberships.find(
    (item) => item.userId === userId && item.organizationId === invite.organizationId,
  );
  if (existing !== undefined) {
    if (existing.role === invite.role) return { status: 200, body: { role: existing.role } };
    return forbidden();
  }
  world.memberships.push({ userId, organizationId: invite.organizationId, role: invite.role });
  return { status: 201, body: { role: invite.role } };
}

export function runAccessForUser(
  world: AccessWorld,
  userId: string | null,
  command: AccessCommand,
): AccessResult {
  if (userId === null) return unauthorized();
  const actor = actorOf(world, userId);
  switch (command.type) {
    case 'membership':
      if (actor === null) return notFound();
      return { status: 200, body: { role: actor.role } };
    case 'child':
      return readChild(world, actor, command.childId);
    case 'brief':
      return readBrief(world, actor, command.briefId);
    case 'church':
      return readChurch(world, actor, command.organizationId);
    case 'lesson':
      return readLesson(world, actor, command.lessonId);
    case 'grant':
      return grantMedical(world, actor, command.childId);
    case 'register':
      return selfRegister(world, userId, command.organizationId, command.requestedRole);
    case 'invite':
      return createInvite(world, actor, command.organizationId, command.requestedRole);
    case 'accept':
      return acceptInvite(world, userId, command.inviteId, command.claimedRole);
    default:
      return assertNever(command);
  }
}

export function runAccess(world: AccessWorld, sessionId: string | null, command: AccessCommand): AccessResult {
  if (sessionId === null) return unauthorized();
  const session = world.sessions.find((item) => item.sessionId === sessionId);
  if (session === undefined) return unauthorized();
  return runAccessForUser(world, session.userId, command);
}
