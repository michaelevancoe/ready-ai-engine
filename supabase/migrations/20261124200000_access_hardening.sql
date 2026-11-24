create or replace function public.current_membership_role(target_org uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select m.role
  from public.memberships m
  where auth.uid() is not null
    and m.organization_id = target_org
    and m.user_id = auth.uid()
  limit 1
$$;

create or replace function public.volunteer_covers_brief(target_brief uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.shared_briefs b
    join public.volunteer_assignments a
      on a.organization_id = b.organization_id
     and a.room_id = b.room_id
     and a.sunday_id = b.sunday_id
     and a.user_id = auth.uid()
    where auth.uid() is not null
      and b.id = target_brief
      and b.shared = true
      and public.current_membership_role(b.organization_id) = 'volunteer'
  )
$$;

create or replace function public.medical_visible(target_child uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    auth.uid() is not null
    and (
      (
        public.current_membership_role(
          (select c.organization_id from public.children c where c.id = target_child)
        ) = 'parent'
        and exists (
          select 1
          from public.children c
          where c.id = target_child
            and c.parent_user_id = auth.uid()
        )
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
          and public.current_membership_role(b.organization_id) = 'volunteer'
      )
    )
$$;

create or replace function public.create_invite(target_org uuid, invite_role text)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'forbidden';
  end if;
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

drop function public.self_register_parent(uuid);

create function public.self_register_parent(target_org uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  existing text;
begin
  if auth.uid() is null then
    raise exception 'forbidden';
  end if;
  if not exists (select 1 from public.organizations o where o.id = target_org) then
    raise exception 'not_found';
  end if;
  select m.role into existing
  from public.memberships m
  where m.organization_id = target_org
    and m.user_id = auth.uid();
  if existing is not null then
    if existing = 'parent' then
      return false;
    end if;
    raise exception 'forbidden';
  end if;
  begin
    insert into public.memberships (organization_id, user_id, role)
    values (target_org, auth.uid(), 'parent');
  exception
    when unique_violation then
      select m.role into existing
      from public.memberships m
      where m.organization_id = target_org
        and m.user_id = auth.uid();
      if existing = 'parent' then
        return false;
      end if;
      raise exception 'forbidden';
  end;
  return true;
end;
$$;

drop function public.accept_invite(uuid);

create function public.accept_invite(invite_id uuid, claimed_role text default null)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  invite_role text;
  invite_org uuid;
  existing text;
begin
  if auth.uid() is null then
    raise exception 'forbidden';
  end if;
  select i.role, i.organization_id into invite_role, invite_org
  from public.invitations i
  where i.id = invite_id;
  if invite_role is null then
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
    and m.user_id = auth.uid();
  if existing is not null then
    if existing = invite_role then
      return jsonb_build_object('role', invite_role, 'created', false);
    end if;
    raise exception 'forbidden';
  end if;
  insert into public.memberships (organization_id, user_id, role)
  values (invite_org, auth.uid(), invite_role);
  return jsonb_build_object('role', invite_role, 'created', true);
end;
$$;

create function public.grant_medical(target_child uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  child_org uuid;
  parent_id uuid;
begin
  if auth.uid() is null then
    raise exception 'forbidden';
  end if;
  select c.organization_id, c.parent_user_id into child_org, parent_id
  from public.children c
  where c.id = target_child;
  if child_org is null then
    raise exception 'not_found';
  end if;
  if parent_id is distinct from auth.uid()
     or public.current_membership_role(child_org) is distinct from 'parent' then
    raise exception 'forbidden';
  end if;
  insert into public.medical_grants (child_id, organization_id, granted)
  values (target_child, child_org, true)
  on conflict (child_id) do update set granted = true;
end;
$$;

revoke all on function public.current_membership_role(uuid) from public, anon, authenticated;
revoke all on function public.volunteer_covers_brief(uuid) from public, anon, authenticated;
revoke all on function public.medical_visible(uuid) from public, anon, authenticated;
revoke all on function public.create_invite(uuid, text) from public, anon, authenticated;
revoke all on function public.self_register_parent(uuid) from public, anon, authenticated;
revoke all on function public.accept_invite(uuid, text) from public, anon, authenticated;
revoke all on function public.grant_medical(uuid) from public, anon, authenticated;

grant execute on function public.current_membership_role(uuid) to authenticated;
grant execute on function public.volunteer_covers_brief(uuid) to authenticated;
grant execute on function public.medical_visible(uuid) to authenticated;
grant execute on function public.create_invite(uuid, text) to authenticated;
grant execute on function public.self_register_parent(uuid) to authenticated;
grant execute on function public.accept_invite(uuid, text) to authenticated;
grant execute on function public.grant_medical(uuid) to authenticated;

grant select on table public.rooms to authenticated;
grant select on table public.sundays to authenticated;
grant select on table public.volunteer_assignments to authenticated;

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
          and a.user_id = auth.uid()
      )
    )
  );

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
          and a.user_id = auth.uid()
      )
    )
  );

alter table public.shared_briefs
  add constraint shared_briefs_lines_no_medical
  check (not (lines @> '[{"field":"medical"}]'::jsonb));

create policy volunteer_assignments_select_scoped
  on public.volunteer_assignments
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.current_membership_role(organization_id) = 'leader'
  );
