update public.memberships set role = 'leader' where role = 'admin';

alter table public.invitations
  add column expires_at timestamptz not null default (now() + interval '7 days');

create or replace function public.create_invite(target_org uuid, invite_role text)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  new_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'forbidden';
  end if;
  if public.current_membership_role(target_org) is distinct from 'leader' then
    raise exception 'forbidden';
  end if;
  if invite_role not in ('volunteer', 'leader') then
    raise exception 'forbidden';
  end if;
  insert into public.invitations (organization_id, role, created_by, expires_at)
  values (target_org, invite_role, (select auth.uid()), now() + interval '7 days')
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.accept_invite(invite_id uuid, claimed_role text default null)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  invite_role text;
  invite_org uuid;
  invite_expires timestamptz;
  existing text;
begin
  if (select auth.uid()) is null then
    raise exception 'forbidden';
  end if;
  select i.role, i.organization_id, i.expires_at
    into invite_role, invite_org, invite_expires
  from public.invitations i
  where i.id = invite_id;
  if invite_role is null or invite_expires <= now() then
    raise exception 'not_found';
  end if;
  if invite_role not in ('volunteer', 'leader') then
    raise exception 'forbidden';
  end if;
  if claimed_role is not null and claimed_role is distinct from invite_role then
    raise exception 'forbidden';
  end if;
  select m.role into existing
  from public.memberships m
  where m.organization_id = invite_org
    and m.user_id = (select auth.uid());
  if existing is not null then
    if existing = invite_role then
      return jsonb_build_object('role', invite_role, 'created', false);
    end if;
    raise exception 'forbidden';
  end if;
  insert into public.memberships (organization_id, user_id, role)
  values (invite_org, (select auth.uid()), invite_role);
  return jsonb_build_object('role', invite_role, 'created', true);
end;
$$;

revoke all on function public.create_invite(uuid, text) from public, anon, authenticated;
revoke all on function public.accept_invite(uuid, text) from public, anon, authenticated;
grant execute on function public.create_invite(uuid, text) to authenticated;
grant execute on function public.accept_invite(uuid, text) to authenticated;

revoke all on function public.protect_child_profile() from public, anon, authenticated;

drop policy child_profiles_select_draft on public.child_profiles;
create policy child_profiles_select_draft
  on public.child_profiles
  for select
  to authenticated
  using (
    status = 'draft'
    and (
      public.current_membership_role(organization_id) = 'leader'
      or (
        public.current_membership_role(organization_id) = 'parent'
        and exists (
          select 1
          from public.children c
          where c.id = child_profiles.child_id
            and c.organization_id = child_profiles.organization_id
            and c.parent_user_id = (select auth.uid())
        )
      )
    )
  );

drop policy child_profiles_insert_draft on public.child_profiles;
create policy child_profiles_insert_draft
  on public.child_profiles
  for insert
  to authenticated
  with check (
    status = 'draft'
    and approved_by is null
    and created_by = (select auth.uid())
    and public.current_membership_role(organization_id) = 'parent'
    and exists (
      select 1
      from public.children c
      where c.id = child_id
        and c.organization_id = organization_id
        and c.parent_user_id = (select auth.uid())
    )
  );

drop policy child_profiles_update_parent on public.child_profiles;
create policy child_profiles_update_parent
  on public.child_profiles
  for update
  to authenticated
  using (
    status = 'draft'
    and public.current_membership_role(organization_id) = 'parent'
    and exists (
      select 1
      from public.children c
      where c.id = child_profiles.child_id
        and c.organization_id = child_profiles.organization_id
        and c.parent_user_id = (select auth.uid())
    )
  )
  with check (
    status = 'approved'
    and approved_by = (select auth.uid())
    and public.current_membership_role(organization_id) = 'parent'
    and exists (
      select 1
      from public.children c
      where c.id = child_profiles.child_id
        and c.organization_id = child_profiles.organization_id
        and c.parent_user_id = (select auth.uid())
    )
  );

drop policy children_select_own_parent on public.children;
create policy children_select_own_parent
  on public.children
  for select
  to authenticated
  using (
    parent_user_id = (select auth.uid())
    and public.current_membership_role(organization_id) = 'parent'
  );

drop policy child_profiles_select_approved_parent on public.child_profiles;
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
        and c.parent_user_id = (select auth.uid())
    )
  );

drop policy medical_grants_select_parent on public.medical_grants;
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
        and c.parent_user_id = (select auth.uid())
    )
  );

drop policy medical_grants_insert_parent on public.medical_grants;
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
        and c.parent_user_id = (select auth.uid())
    )
  );

drop policy medical_grants_update_parent on public.medical_grants;
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
        and c.parent_user_id = (select auth.uid())
    )
  )
  with check (
    public.current_membership_role(organization_id) = 'parent'
    and exists (
      select 1
      from public.children c
      where c.id = medical_grants.child_id
        and c.organization_id = medical_grants.organization_id
        and c.parent_user_id = (select auth.uid())
    )
  );

drop policy rooms_select_scoped on public.rooms;
create policy rooms_select_scoped
  on public.rooms
  for select
  to authenticated
  using (
    public.current_membership_role(organization_id) = 'leader'
    or (
      public.current_membership_role(organization_id) = 'volunteer'
      and exists (
        select 1
        from public.volunteer_assignments a
        where a.room_id = rooms.id
          and a.organization_id = rooms.organization_id
          and a.user_id = (select auth.uid())
      )
    )
  );

drop policy sundays_select_scoped on public.sundays;
create policy sundays_select_scoped
  on public.sundays
  for select
  to authenticated
  using (
    public.current_membership_role(organization_id) = 'leader'
    or (
      public.current_membership_role(organization_id) = 'volunteer'
      and exists (
        select 1
        from public.volunteer_assignments a
        where a.sunday_id = sundays.id
          and a.organization_id = sundays.organization_id
          and a.user_id = (select auth.uid())
      )
    )
  );

drop policy volunteer_assignments_select_scoped on public.volunteer_assignments;
create policy volunteer_assignments_select_scoped
  on public.volunteer_assignments
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or public.current_membership_role(organization_id) = 'leader'
  );

alter table public.lessons
  add column source text not null default '',
  add column summary text not null default '',
  add column steps jsonb not null default '[]'::jsonb,
  add column status text not null default 'approved',
  add column author_user_id uuid,
  add constraint lessons_status_check check (status = 'approved'),
  add constraint lessons_steps_array check (jsonb_typeof(steps) = 'array'),
  add constraint lessons_organization_unique unique (organization_id);

grant insert, update, delete on table public.church_setup to authenticated;
grant insert, update, delete on table public.lessons to authenticated;

create policy church_setup_insert_leader
  on public.church_setup
  for insert
  to authenticated
  with check (
    (select auth.uid()) is not null
    and public.current_membership_role(organization_id) = 'leader'
  );

create policy church_setup_update_leader
  on public.church_setup
  for update
  to authenticated
  using (
    (select auth.uid()) is not null
    and public.current_membership_role(organization_id) = 'leader'
  )
  with check (
    (select auth.uid()) is not null
    and public.current_membership_role(organization_id) = 'leader'
  );

create policy lessons_insert_leader
  on public.lessons
  for insert
  to authenticated
  with check (
    status = 'approved'
    and author_user_id = (select auth.uid())
    and public.current_membership_role(organization_id) = 'leader'
  );

create policy lessons_update_leader
  on public.lessons
  for update
  to authenticated
  using (
    author_user_id = (select auth.uid())
    and public.current_membership_role(organization_id) = 'leader'
  )
  with check (
    status = 'approved'
    and author_user_id = (select auth.uid())
    and public.current_membership_role(organization_id) = 'leader'
  );

create policy lessons_delete_leader
  on public.lessons
  for delete
  to authenticated
  using (
    author_user_id = (select auth.uid())
    and public.current_membership_role(organization_id) = 'leader'
  );

create table public.intake_answers (
  organization_id uuid not null,
  child_id uuid not null,
  user_id uuid not null,
  answers jsonb not null,
  primary key (organization_id, child_id),
  constraint intake_answers_child_in_organization
    foreign key (child_id, organization_id)
    references public.children (id, organization_id)
    on delete cascade
);

create table public.parent_briefs (
  child_id uuid primary key references public.children (id) on delete cascade,
  organization_id uuid not null,
  user_id uuid not null,
  loves text not null,
  overwhelms text not null,
  what_helps text not null,
  communication text not null,
  sensory text not null,
  toileting text not null,
  allergies text not null,
  calming text not null,
  medical text not null,
  show_loves boolean not null,
  show_overwhelms boolean not null,
  show_what_helps boolean not null,
  show_communication boolean not null,
  show_sensory boolean not null,
  show_toileting boolean not null,
  show_allergies boolean not null,
  show_calming boolean not null,
  show_medical boolean not null,
  card_touched boolean not null,
  constraint parent_briefs_child_in_organization
    foreign key (child_id, organization_id)
    references public.children (id, organization_id)
    on delete cascade
);

create table public.brief_publications (
  organization_id uuid not null,
  child_id uuid not null,
  user_id uuid not null,
  lines jsonb not null,
  primary key (organization_id, child_id),
  constraint brief_publications_lines_array check (jsonb_typeof(lines) = 'array'),
  constraint brief_publications_lines_no_medical
    check (not (lines @> '[{"field":"medical"}]'::jsonb)),
  constraint brief_publications_child_in_organization
    foreign key (child_id, organization_id)
    references public.children (id, organization_id)
    on delete cascade
);

create table public.volunteer_notes (
  user_id uuid not null,
  child_id uuid not null,
  organization_id uuid not null,
  body text not null,
  primary key (user_id, child_id),
  constraint volunteer_notes_child_in_organization
    foreign key (child_id, organization_id)
    references public.children (id, organization_id)
    on delete cascade
);

create table public.sunday_updates (
  child_id uuid primary key references public.children (id) on delete cascade,
  organization_id uuid not null,
  author_user_id uuid not null,
  body text not null,
  status text not null,
  constraint sunday_updates_status_check check (status = 'approved'),
  constraint sunday_updates_child_in_organization
    foreign key (child_id, organization_id)
    references public.children (id, organization_id)
    on delete cascade
);

alter table public.intake_answers enable row level security;
alter table public.intake_answers force row level security;
alter table public.parent_briefs enable row level security;
alter table public.parent_briefs force row level security;
alter table public.brief_publications enable row level security;
alter table public.brief_publications force row level security;
alter table public.volunteer_notes enable row level security;
alter table public.volunteer_notes force row level security;
alter table public.sunday_updates enable row level security;
alter table public.sunday_updates force row level security;

revoke all on table public.intake_answers from anon, authenticated, public;
revoke all on table public.parent_briefs from anon, authenticated, public;
revoke all on table public.brief_publications from anon, authenticated, public;
revoke all on table public.volunteer_notes from anon, authenticated, public;
revoke all on table public.sunday_updates from anon, authenticated, public;

grant select, insert, update on table public.intake_answers to authenticated;
grant select, insert, update on table public.parent_briefs to authenticated;
grant select, insert, update, delete on table public.brief_publications to authenticated;
grant select, insert, update on table public.volunteer_notes to authenticated;
grant select, insert, update, delete on table public.sunday_updates to authenticated;

create policy intake_answers_select_parent
  on public.intake_answers
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    and public.current_membership_role(organization_id) = 'parent'
    and exists (
      select 1
      from public.children c
      where c.id = intake_answers.child_id
        and c.organization_id = intake_answers.organization_id
        and c.parent_user_id = (select auth.uid())
    )
  );

create policy intake_answers_insert_parent
  on public.intake_answers
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and public.current_membership_role(organization_id) = 'parent'
    and exists (
      select 1
      from public.children c
      where c.id = child_id
        and c.organization_id = organization_id
        and c.parent_user_id = (select auth.uid())
    )
  );

create policy intake_answers_update_parent
  on public.intake_answers
  for update
  to authenticated
  using (
    user_id = (select auth.uid())
    and public.current_membership_role(organization_id) = 'parent'
    and exists (
      select 1
      from public.children c
      where c.id = intake_answers.child_id
        and c.organization_id = intake_answers.organization_id
        and c.parent_user_id = (select auth.uid())
    )
  )
  with check (
    user_id = (select auth.uid())
    and public.current_membership_role(organization_id) = 'parent'
    and exists (
      select 1
      from public.children c
      where c.id = child_id
        and c.organization_id = organization_id
        and c.parent_user_id = (select auth.uid())
    )
  );

create policy parent_briefs_select_parent
  on public.parent_briefs
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    and public.current_membership_role(organization_id) = 'parent'
    and exists (
      select 1
      from public.children c
      where c.id = parent_briefs.child_id
        and c.organization_id = parent_briefs.organization_id
        and c.parent_user_id = (select auth.uid())
    )
  );

create policy parent_briefs_insert_parent
  on public.parent_briefs
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and public.current_membership_role(organization_id) = 'parent'
    and exists (
      select 1
      from public.children c
      where c.id = child_id
        and c.organization_id = organization_id
        and c.parent_user_id = (select auth.uid())
    )
  );

create policy parent_briefs_update_parent
  on public.parent_briefs
  for update
  to authenticated
  using (
    user_id = (select auth.uid())
    and public.current_membership_role(organization_id) = 'parent'
    and exists (
      select 1
      from public.children c
      where c.id = parent_briefs.child_id
        and c.organization_id = parent_briefs.organization_id
        and c.parent_user_id = (select auth.uid())
    )
  )
  with check (
    user_id = (select auth.uid())
    and public.current_membership_role(organization_id) = 'parent'
    and exists (
      select 1
      from public.children c
      where c.id = child_id
        and c.organization_id = organization_id
        and c.parent_user_id = (select auth.uid())
    )
  );

create policy brief_publications_select_parent
  on public.brief_publications
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    and public.current_membership_role(organization_id) = 'parent'
    and exists (
      select 1
      from public.children c
      where c.id = brief_publications.child_id
        and c.organization_id = brief_publications.organization_id
        and c.parent_user_id = (select auth.uid())
    )
  );

create policy brief_publications_insert_parent
  on public.brief_publications
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and public.current_membership_role(organization_id) = 'parent'
    and exists (
      select 1
      from public.children c
      where c.id = child_id
        and c.organization_id = organization_id
        and c.parent_user_id = (select auth.uid())
    )
  );

create policy brief_publications_update_parent
  on public.brief_publications
  for update
  to authenticated
  using (
    user_id = (select auth.uid())
    and public.current_membership_role(organization_id) = 'parent'
    and exists (
      select 1
      from public.children c
      where c.id = brief_publications.child_id
        and c.organization_id = brief_publications.organization_id
        and c.parent_user_id = (select auth.uid())
    )
  )
  with check (
    user_id = (select auth.uid())
    and public.current_membership_role(organization_id) = 'parent'
    and exists (
      select 1
      from public.children c
      where c.id = child_id
        and c.organization_id = organization_id
        and c.parent_user_id = (select auth.uid())
    )
  );

create policy brief_publications_delete_parent
  on public.brief_publications
  for delete
  to authenticated
  using (
    user_id = (select auth.uid())
    and public.current_membership_role(organization_id) = 'parent'
    and exists (
      select 1
      from public.children c
      where c.id = brief_publications.child_id
        and c.organization_id = brief_publications.organization_id
        and c.parent_user_id = (select auth.uid())
    )
  );

create policy volunteer_notes_select_owner
  on public.volunteer_notes
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    and public.current_membership_role(organization_id) = 'volunteer'
  );

create policy volunteer_notes_insert_owner
  on public.volunteer_notes
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and public.current_membership_role(organization_id) = 'volunteer'
  );

create policy volunteer_notes_update_owner
  on public.volunteer_notes
  for update
  to authenticated
  using (
    user_id = (select auth.uid())
    and public.current_membership_role(organization_id) = 'volunteer'
  )
  with check (
    user_id = (select auth.uid())
    and public.current_membership_role(organization_id) = 'volunteer'
  );

create policy sunday_updates_select_leader
  on public.sunday_updates
  for select
  to authenticated
  using (
    author_user_id = (select auth.uid())
    and status = 'approved'
    and public.current_membership_role(organization_id) = 'leader'
  );

create policy sunday_updates_insert_leader
  on public.sunday_updates
  for insert
  to authenticated
  with check (
    author_user_id = (select auth.uid())
    and status = 'approved'
    and public.current_membership_role(organization_id) = 'leader'
  );

create policy sunday_updates_update_leader
  on public.sunday_updates
  for update
  to authenticated
  using (
    author_user_id = (select auth.uid())
    and public.current_membership_role(organization_id) = 'leader'
  )
  with check (
    author_user_id = (select auth.uid())
    and status = 'approved'
    and public.current_membership_role(organization_id) = 'leader'
  );

create policy sunday_updates_delete_leader
  on public.sunday_updates
  for delete
  to authenticated
  using (
    author_user_id = (select auth.uid())
    and public.current_membership_role(organization_id) = 'leader'
  );

create policy sunday_updates_select_parent
  on public.sunday_updates
  for select
  to authenticated
  using (
    status = 'approved'
    and public.current_membership_role(organization_id) = 'parent'
    and exists (
      select 1
      from public.children c
      where c.id = sunday_updates.child_id
        and c.organization_id = sunday_updates.organization_id
        and c.parent_user_id = (select auth.uid())
    )
  );
