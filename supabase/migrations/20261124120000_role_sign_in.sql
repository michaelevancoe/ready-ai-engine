alter table public.memberships drop constraint memberships_role_check;
alter table public.memberships add constraint memberships_role_check
  check (role in ('admin', 'parent', 'volunteer', 'leader'));

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null
);

create table public.sundays (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  label text not null
);

create table public.volunteer_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null,
  room_id uuid not null references public.rooms (id) on delete cascade,
  sunday_id uuid not null references public.sundays (id) on delete cascade,
  constraint volunteer_assignments_unique unique (organization_id, user_id, room_id, sunday_id)
);

create table public.shared_briefs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  child_id uuid not null,
  room_id uuid not null references public.rooms (id) on delete cascade,
  sunday_id uuid not null references public.sundays (id) on delete cascade,
  shared boolean not null default false,
  lines jsonb not null default '[]'::jsonb,
  constraint shared_briefs_child_in_organization
    foreign key (child_id, organization_id)
    references public.children (id, organization_id)
    on delete cascade
);

create table public.medical_grants (
  child_id uuid primary key references public.children (id) on delete cascade,
  organization_id uuid not null,
  granted boolean not null default false,
  constraint medical_grants_child_in_organization
    foreign key (child_id, organization_id)
    references public.children (id, organization_id)
    on delete cascade
);

create table public.medical_notes (
  child_id uuid primary key references public.children (id) on delete cascade,
  organization_id uuid not null,
  note text not null,
  constraint medical_notes_child_in_organization
    foreign key (child_id, organization_id)
    references public.children (id, organization_id)
    on delete cascade
);

create table public.church_setup (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  name text not null,
  service text not null,
  room text not null,
  leader_label text not null,
  ages text not null,
  plan text not null
);

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  title text not null,
  body text not null default ''
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  role text not null,
  created_by uuid not null,
  constraint invitations_role_check check (role in ('volunteer', 'leader'))
);

create or replace function public.volunteer_covers_brief(target_brief uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.shared_briefs b
    join public.volunteer_assignments a
      on a.organization_id = b.organization_id
     and a.room_id = b.room_id
     and a.sunday_id = b.sunday_id
     and a.user_id = auth.uid()
    where b.id = target_brief
      and b.shared = true
  )
$$;

create or replace function public.medical_visible(target_child uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1
      from public.children c
      where c.id = target_child
        and c.parent_user_id = auth.uid()
    )
    or exists (
      select 1
      from public.medical_grants g
      join public.shared_briefs b
        on b.child_id = g.child_id
       and b.shared = true
      join public.volunteer_assignments a
        on a.organization_id = b.organization_id
       and a.room_id = b.room_id
       and a.sunday_id = b.sunday_id
       and a.user_id = auth.uid()
      where g.child_id = target_child
        and g.granted = true
    )
$$;

create or replace function public.self_register_parent(target_org uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  existing text;
begin
  if not exists (select 1 from public.organizations o where o.id = target_org) then
    raise exception 'not_found';
  end if;
  select m.role into existing
  from public.memberships m
  where m.organization_id = target_org
    and m.user_id = auth.uid();
  if existing is not null then
    if existing = 'parent' then
      return;
    end if;
    raise exception 'forbidden';
  end if;
  insert into public.memberships (organization_id, user_id, role)
  values (target_org, auth.uid(), 'parent');
end;
$$;

create or replace function public.create_invite(target_org uuid, invite_role text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if public.current_membership_role(target_org) is distinct from 'leader' then
    raise exception 'forbidden';
  end if;
  if invite_role not in ('volunteer', 'leader') then
    raise exception 'forbidden';
  end if;
  insert into public.invitations (organization_id, role, created_by)
  values (target_org, invite_role, auth.uid())
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.accept_invite(invite_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_role text;
  invite_org uuid;
  existing text;
begin
  select i.role, i.organization_id into invite_role, invite_org
  from public.invitations i
  where i.id = invite_id;
  if invite_role is null or invite_role not in ('volunteer', 'leader') then
    raise exception 'forbidden';
  end if;
  select m.role into existing
  from public.memberships m
  where m.organization_id = invite_org
    and m.user_id = auth.uid();
  if existing is not null then
    if existing = invite_role then
      return existing;
    end if;
    raise exception 'forbidden';
  end if;
  insert into public.memberships (organization_id, user_id, role)
  values (invite_org, auth.uid(), invite_role);
  return invite_role;
end;
$$;

revoke all on function public.volunteer_covers_brief(uuid) from public, anon;
revoke all on function public.medical_visible(uuid) from public, anon;
revoke all on function public.self_register_parent(uuid) from public, anon;
revoke all on function public.create_invite(uuid, text) from public, anon;
revoke all on function public.accept_invite(uuid) from public, anon;
grant execute on function public.volunteer_covers_brief(uuid) to authenticated;
grant execute on function public.medical_visible(uuid) to authenticated;
grant execute on function public.self_register_parent(uuid) to authenticated;
grant execute on function public.create_invite(uuid, text) to authenticated;
grant execute on function public.accept_invite(uuid) to authenticated;

drop policy children_select_member on public.children;
create policy children_select_own_parent
  on public.children
  for select
  to authenticated
  using (
    parent_user_id = auth.uid()
    and public.current_membership_role(organization_id) = 'parent'
  );

drop policy child_profiles_select_approved on public.child_profiles;
create policy child_profiles_select_approved_parent
  on public.child_profiles
  for select
  to authenticated
  using (
    status = 'approved'
    and public.current_membership_role(organization_id) = 'parent'
    and exists (
      select 1
      from public.children c
      where c.id = child_profiles.child_id
        and c.organization_id = child_profiles.organization_id
        and c.parent_user_id = auth.uid()
    )
  );

alter table public.rooms enable row level security;
alter table public.rooms force row level security;
alter table public.sundays enable row level security;
alter table public.sundays force row level security;
alter table public.volunteer_assignments enable row level security;
alter table public.volunteer_assignments force row level security;
alter table public.shared_briefs enable row level security;
alter table public.shared_briefs force row level security;
alter table public.medical_grants enable row level security;
alter table public.medical_grants force row level security;
alter table public.medical_notes enable row level security;
alter table public.medical_notes force row level security;
alter table public.church_setup enable row level security;
alter table public.church_setup force row level security;
alter table public.lessons enable row level security;
alter table public.lessons force row level security;
alter table public.invitations enable row level security;
alter table public.invitations force row level security;

revoke all on table public.rooms from anon, authenticated, public;
revoke all on table public.sundays from anon, authenticated, public;
revoke all on table public.volunteer_assignments from anon, authenticated, public;
revoke all on table public.shared_briefs from anon, authenticated, public;
revoke all on table public.medical_grants from anon, authenticated, public;
revoke all on table public.medical_notes from anon, authenticated, public;
revoke all on table public.church_setup from anon, authenticated, public;
revoke all on table public.lessons from anon, authenticated, public;
revoke all on table public.invitations from anon, authenticated, public;

grant select on table public.shared_briefs to authenticated;
grant select, insert, update on table public.medical_grants to authenticated;
grant select on table public.medical_notes to authenticated;
grant select on table public.church_setup to authenticated;
grant select on table public.lessons to authenticated;
grant select on table public.invitations to authenticated;

create policy shared_briefs_select_assigned
  on public.shared_briefs
  for select
  to authenticated
  using (public.volunteer_covers_brief(id));

create policy medical_notes_select_granted
  on public.medical_notes
  for select
  to authenticated
  using (public.medical_visible(child_id));

create policy medical_grants_select_parent
  on public.medical_grants
  for select
  to authenticated
  using (
    public.current_membership_role(organization_id) = 'parent'
    and exists (
      select 1
      from public.children c
      where c.id = medical_grants.child_id
        and c.organization_id = medical_grants.organization_id
        and c.parent_user_id = auth.uid()
    )
  );

create policy medical_grants_insert_parent
  on public.medical_grants
  for insert
  to authenticated
  with check (
    public.current_membership_role(organization_id) = 'parent'
    and exists (
      select 1
      from public.children c
      where c.id = child_id
        and c.organization_id = organization_id
        and c.parent_user_id = auth.uid()
    )
  );

create policy medical_grants_update_parent
  on public.medical_grants
  for update
  to authenticated
  using (
    public.current_membership_role(organization_id) = 'parent'
    and exists (
      select 1
      from public.children c
      where c.id = medical_grants.child_id
        and c.organization_id = medical_grants.organization_id
        and c.parent_user_id = auth.uid()
    )
  )
  with check (
    public.current_membership_role(organization_id) = 'parent'
    and exists (
      select 1
      from public.children c
      where c.id = medical_grants.child_id
        and c.organization_id = medical_grants.organization_id
        and c.parent_user_id = auth.uid()
    )
  );

create policy church_setup_select_leader
  on public.church_setup
  for select
  to authenticated
  using (public.current_membership_role(organization_id) = 'leader');

create policy lessons_select_leader
  on public.lessons
  for select
  to authenticated
  using (public.current_membership_role(organization_id) = 'leader');

create policy invitations_select_leader
  on public.invitations
  for select
  to authenticated
  using (public.current_membership_role(organization_id) = 'leader');
