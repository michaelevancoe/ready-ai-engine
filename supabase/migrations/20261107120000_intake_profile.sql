-- Intake drafts and parent approval. user ids are auth.uid() values.
-- They are not foreign-keyed to auth.users so the fictional seed can load
-- before GoTrue users exist. Policies still compare them to auth.uid().

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null,
  role text not null,
  created_at timestamptz not null default now(),
  constraint memberships_role_check check (role in ('admin', 'parent', 'volunteer')),
  constraint memberships_org_user_unique unique (organization_id, user_id)
);

create table public.children (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  display_name text not null,
  parent_user_id uuid not null,
  created_at timestamptz not null default now(),
  constraint children_id_organization unique (id, organization_id)
);

create table public.child_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  child_id uuid not null,
  status text not null default 'draft',
  profile jsonb not null,
  created_by uuid not null,
  approved_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint child_profiles_status_check check (status in ('draft', 'approved')),
  constraint child_profiles_approval_check check (
    (status = 'draft' and approved_by is null)
    or (status = 'approved' and approved_by is not null)
  ),
  constraint child_profiles_child_in_organization
    foreign key (child_id, organization_id)
    references public.children (id, organization_id)
    on delete cascade
);

create index memberships_user_idx on public.memberships (user_id);
create index children_organization_idx on public.children (organization_id);
create index child_profiles_child_idx on public.child_profiles (organization_id, child_id, status);

create or replace function public.current_membership_role(target_org uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select m.role
  from public.memberships m
  where m.organization_id = target_org
    and m.user_id = auth.uid()
  limit 1
$$;

revoke all on function public.current_membership_role(uuid) from public, anon;
grant execute on function public.current_membership_role(uuid) to authenticated;

-- Draft content stays immutable. Approval cannot rewrite the model output.
create or replace function public.protect_child_profile()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.id is distinct from old.id
     or new.organization_id is distinct from old.organization_id
     or new.child_id is distinct from old.child_id
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at
     or new.profile is distinct from old.profile
  then
    raise exception 'child profile identity is immutable';
  end if;
  if old.status = 'approved' then
    raise exception 'approved child profiles are immutable';
  end if;
  if new.status = 'approved' and new.approved_by is null then
    raise exception 'approval requires approved_by';
  end if;
  new.updated_at = now();
  return new;
end;
$$;

create trigger child_profiles_protect
  before update on public.child_profiles
  for each row
  execute function public.protect_child_profile();

alter table public.organizations enable row level security;
alter table public.organizations force row level security;
alter table public.memberships enable row level security;
alter table public.memberships force row level security;
alter table public.children enable row level security;
alter table public.children force row level security;
alter table public.child_profiles enable row level security;
alter table public.child_profiles force row level security;

revoke all on table public.organizations from anon, authenticated, public;
revoke all on table public.memberships from anon, authenticated, public;
revoke all on table public.children from anon, authenticated, public;
revoke all on table public.child_profiles from anon, authenticated, public;

grant select on table public.organizations to authenticated;
grant select on table public.memberships to authenticated;
grant select on table public.children to authenticated;
grant select, insert, update on table public.child_profiles to authenticated;

create policy organizations_select_member
  on public.organizations
  for select
  to authenticated
  using (public.current_membership_role(id) is not null);

create policy memberships_select_member
  on public.memberships
  for select
  to authenticated
  using (public.current_membership_role(organization_id) is not null);

create policy children_select_member
  on public.children
  for select
  to authenticated
  using (public.current_membership_role(organization_id) is not null);

-- Approved profiles are visible to every member of the organization, including volunteers.
create policy child_profiles_select_approved
  on public.child_profiles
  for select
  to authenticated
  using (
    status = 'approved'
    and public.current_membership_role(organization_id) is not null
  );

-- Drafts are visible to organization admins and to that child's parent. Volunteers do not match.
create policy child_profiles_select_draft
  on public.child_profiles
  for select
  to authenticated
  using (
    status = 'draft'
    and (
      public.current_membership_role(organization_id) = 'admin'
      or (
        public.current_membership_role(organization_id) = 'parent'
        and exists (
          select 1
          from public.children c
          where c.id = child_profiles.child_id
            and c.organization_id = child_profiles.organization_id
            and c.parent_user_id = auth.uid()
        )
      )
    )
  );

create policy child_profiles_insert_draft
  on public.child_profiles
  for insert
  to authenticated
  with check (
    status = 'draft'
    and approved_by is null
    and created_by = auth.uid()
    and public.current_membership_role(organization_id) = 'parent'
    and exists (
      select 1
      from public.children c
      where c.id = child_id
        and c.organization_id = organization_id
        and c.parent_user_id = auth.uid()
    )
  );

-- Only the parent of that child can move a draft to approved.
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
        and c.parent_user_id = auth.uid()
    )
  )
  with check (
    status = 'approved'
    and approved_by = auth.uid()
    and public.current_membership_role(organization_id) = 'parent'
    and exists (
      select 1
      from public.children c
      where c.id = child_profiles.child_id
        and c.organization_id = child_profiles.organization_id
        and c.parent_user_id = auth.uid()
    )
  );
