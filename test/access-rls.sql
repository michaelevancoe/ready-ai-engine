begin;

delete from public.organizations where id in (
  '10000000-0000-4000-8000-0000000000a1',
  '10000000-0000-4000-8000-0000000000a2'
);

insert into public.organizations (id, name) values
  ('10000000-0000-4000-8000-0000000000a1', 'Harbor'),
  ('10000000-0000-4000-8000-0000000000a2', 'Inland');

insert into public.children (id, organization_id, display_name, parent_user_id) values
  (
    '10000000-0000-4000-8000-0000000000d1',
    '10000000-0000-4000-8000-0000000000a1',
    'Harbor Child',
    '10000000-0000-4000-8000-0000000000c1'
  ),
  (
    '10000000-0000-4000-8000-0000000000d2',
    '10000000-0000-4000-8000-0000000000a1',
    'Other Child',
    '10000000-0000-4000-8000-0000000000c2'
  );

insert into public.memberships (organization_id, user_id, role) values
  ('10000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-0000000000c1', 'parent'),
  ('10000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-0000000000c3', 'volunteer'),
  ('10000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-0000000000c4', 'volunteer'),
  ('10000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-0000000000c6', 'leader'),
  ('10000000-0000-4000-8000-0000000000a2', '10000000-0000-4000-8000-0000000000c7', 'leader');

insert into public.rooms (id, organization_id, name) values
  ('10000000-0000-4000-8000-0000000000e1', '10000000-0000-4000-8000-0000000000a1', 'Harbor Room'),
  ('10000000-0000-4000-8000-0000000000e2', '10000000-0000-4000-8000-0000000000a1', 'Other Room'),
  ('10000000-0000-4000-8000-0000000000e3', '10000000-0000-4000-8000-0000000000a2', 'Inland Room');

insert into public.sundays (id, organization_id, label) values
  ('10000000-0000-4000-8000-0000000000f1', '10000000-0000-4000-8000-0000000000a1', 'Harbor Sunday'),
  ('10000000-0000-4000-8000-0000000000f2', '10000000-0000-4000-8000-0000000000a1', 'Other Sunday'),
  ('10000000-0000-4000-8000-0000000000f3', '10000000-0000-4000-8000-0000000000a2', 'Inland Sunday');

insert into public.volunteer_assignments (organization_id, user_id, room_id, sunday_id) values
  (
    '10000000-0000-4000-8000-0000000000a1',
    '10000000-0000-4000-8000-0000000000c3',
    '10000000-0000-4000-8000-0000000000e1',
    '10000000-0000-4000-8000-0000000000f1'
  ),
  (
    '10000000-0000-4000-8000-0000000000a1',
    '10000000-0000-4000-8000-0000000000c4',
    '10000000-0000-4000-8000-0000000000e2',
    '10000000-0000-4000-8000-0000000000f2'
  ),
  (
    '10000000-0000-4000-8000-0000000000a1',
    '10000000-0000-4000-8000-0000000000c1',
    '10000000-0000-4000-8000-0000000000e1',
    '10000000-0000-4000-8000-0000000000f1'
  );

insert into public.shared_briefs (id, organization_id, child_id, room_id, sunday_id, shared, lines) values
  (
    '10000000-0000-4000-8000-0000000000b1',
    '10000000-0000-4000-8000-0000000000a1',
    '10000000-0000-4000-8000-0000000000d1',
    '10000000-0000-4000-8000-0000000000e1',
    '10000000-0000-4000-8000-0000000000f1',
    true,
    '[{"field":"loves","text":"Harbor loves"}]'::jsonb
  ),
  (
    '10000000-0000-4000-8000-0000000000b2',
    '10000000-0000-4000-8000-0000000000a1',
    '10000000-0000-4000-8000-0000000000d1',
    '10000000-0000-4000-8000-0000000000e2',
    '10000000-0000-4000-8000-0000000000f1',
    true,
    '[{"field":"loves","text":"Other room"}]'::jsonb
  ),
  (
    '10000000-0000-4000-8000-0000000000b3',
    '10000000-0000-4000-8000-0000000000a1',
    '10000000-0000-4000-8000-0000000000d1',
    '10000000-0000-4000-8000-0000000000e1',
    '10000000-0000-4000-8000-0000000000f2',
    true,
    '[{"field":"loves","text":"Other sunday"}]'::jsonb
  );

insert into public.medical_notes (child_id, organization_id, note) values (
  '10000000-0000-4000-8000-0000000000d1',
  '10000000-0000-4000-8000-0000000000a1',
  'Harbor medical'
);

insert into public.church_setup (organization_id, name, service, room, leader_label, ages, plan) values
  (
    '10000000-0000-4000-8000-0000000000a1',
    'Harbor Church',
    'Sunday',
    'Harbor Room',
    'Harbor Lead',
    '6-8',
    'Harbor plan'
  ),
  (
    '10000000-0000-4000-8000-0000000000a2',
    'Inland Church',
    'Sunday',
    'Inland Room',
    'Inland Lead',
    '6-8',
    'Inland plan'
  );

insert into public.lessons (id, organization_id, title) values
  ('10000000-0000-4000-8000-0000000000b4', '10000000-0000-4000-8000-0000000000a1', 'Harbor Lesson'),
  ('10000000-0000-4000-8000-0000000000b5', '10000000-0000-4000-8000-0000000000a2', 'Inland Lesson');

insert into public.invitations (id, organization_id, role, created_by) values (
  '10000000-0000-4000-8000-0000000000a9',
  '10000000-0000-4000-8000-0000000000a1',
  'volunteer',
  '10000000-0000-4000-8000-0000000000c6'
);

do $$
declare
  fn text;
  definer boolean;
  config text[];
begin
  foreach fn in array array[
    'current_membership_role',
    'volunteer_covers_brief',
    'medical_visible',
    'self_register_parent',
    'create_invite',
    'accept_invite',
    'grant_medical'
  ]
  loop
    select p.prosecdef, p.proconfig into definer, config
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = fn;
    if definer is distinct from true then
      raise exception '% is not security definer', fn;
    end if;
    if config is distinct from array['search_path=pg_catalog, public']::text[] then
      raise exception '% search_path is %', fn, config;
    end if;
  end loop;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'accept_invite') <> 1 then
    raise exception 'accept_invite has more than one signature';
  end if;
end
$$;

do $$
declare
  fn text;
  args text;
begin
  foreach fn, args in array array[
    ('current_membership_role', 'uuid'),
    ('volunteer_covers_brief', 'uuid'),
    ('medical_visible', 'uuid'),
    ('self_register_parent', 'uuid'),
    ('create_invite', 'uuid, text'),
    ('accept_invite', 'uuid, text'),
    ('grant_medical', 'uuid')
  ]
  loop
    if has_function_privilege('anon', format('public.%I(%s)', fn, args), 'execute') then
      raise exception 'anon can execute %', fn;
    end if;
    if has_function_privilege('public', format('public.%I(%s)', fn, args), 'execute') then
      raise exception 'public can execute %', fn;
    end if;
    if not has_function_privilege('authenticated', format('public.%I(%s)', fn, args), 'execute') then
      raise exception 'authenticated cannot execute %', fn;
    end if;
  end loop;
end
$$;

do $$
declare
  created boolean;
  parent_id uuid;
  visible int;
begin
  perform set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-0000000000c8', true);
  perform set_config(
    'request.jwt.claims',
    '{"sub":"10000000-0000-4000-8000-0000000000c8","role":"authenticated"}',
    true
  );
  execute 'set local role authenticated';
  if auth.uid()::text is distinct from '10000000-0000-4000-8000-0000000000c8' then
    raise exception 'auth.uid() is %', auth.uid();
  end if;
  begin
    execute 'select public.self_register_parent($1, $2)'
      using '10000000-0000-4000-8000-0000000000a1'::uuid, 'leader';
    raise exception 'self_register_parent accepted a role argument';
  exception
    when undefined_function then
      null;
  end;
  created := public.self_register_parent('10000000-0000-4000-8000-0000000000a1');
  if created is distinct from true then
    raise exception 'new parent register returned %', created;
  end if;
  select count(*) into visible
  from public.children
  where id = '10000000-0000-4000-8000-0000000000d1';
  if visible <> 0 then
    raise exception 'new parent can see another child';
  end if;
  begin
    update public.children
    set parent_user_id = '10000000-0000-4000-8000-0000000000c8'
    where id = '10000000-0000-4000-8000-0000000000d1';
    raise exception 'new parent updated another child';
  exception
    when insufficient_privilege then
      null;
  end;
  execute 'reset role';
  select c.parent_user_id into parent_id
  from public.children c
  where c.id = '10000000-0000-4000-8000-0000000000d1';
  if parent_id::text is distinct from '10000000-0000-4000-8000-0000000000c1' then
    raise exception 'parent_user_id changed to %', parent_id;
  end if;
  if (
    select m.role from public.memberships m
    where m.user_id = '10000000-0000-4000-8000-0000000000c8'
  ) is distinct from 'parent' then
    raise exception 'registered role is not parent';
  end if;
end
$$;

do $$
declare
  role text;
begin
  perform set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-0000000000c3', true);
  perform set_config(
    'request.jwt.claims',
    '{"sub":"10000000-0000-4000-8000-0000000000c3","role":"authenticated"}',
    true
  );
  execute 'set local role authenticated';
  begin
    perform public.self_register_parent('10000000-0000-4000-8000-0000000000a1');
    raise exception 'volunteer self_register_parent succeeded';
  exception
    when raise_exception then
      if sqlerrm is distinct from 'forbidden' then
        raise;
      end if;
  end;
  execute 'reset role';
  select m.role into role
  from public.memberships m
  where m.user_id = '10000000-0000-4000-8000-0000000000c3';
  if role is distinct from 'volunteer' then
    raise exception 'volunteer role became %', role;
  end if;
end
$$;

do $$
declare
  room_count int;
  own_count int;
  other_count int;
  sunday_count int;
  assignment_count int;
  other_assignment int;
begin
  perform set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-0000000000c3', true);
  perform set_config(
    'request.jwt.claims',
    '{"sub":"10000000-0000-4000-8000-0000000000c3","role":"authenticated"}',
    true
  );
  execute 'set local role authenticated';
  if auth.uid()::text is distinct from '10000000-0000-4000-8000-0000000000c3' then
    raise exception 'volunteer auth.uid() is %', auth.uid();
  end if;
  select count(*) into room_count from public.rooms;
  select count(*) into own_count from public.rooms where name = 'Harbor Room';
  select count(*) into other_count from public.rooms where name = 'Other Room';
  select count(*) into sunday_count from public.sundays where label = 'Harbor Sunday';
  select count(*) into assignment_count from public.volunteer_assignments;
  select count(*) into other_assignment
  from public.volunteer_assignments
  where user_id = '10000000-0000-4000-8000-0000000000c4';
  if room_count <> 1 or own_count <> 1 or other_count <> 0 then
    raise exception 'volunteer rooms total=% own=% other=%', room_count, own_count, other_count;
  end if;
  if sunday_count <> 1 then
    raise exception 'volunteer sundays %', sunday_count;
  end if;
  if assignment_count <> 1 or other_assignment <> 0 then
    raise exception 'volunteer assignments total=% other=%', assignment_count, other_assignment;
  end if;
end
$$;

do $$
declare
  room_count int;
  inland int;
begin
  perform set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-0000000000c7', true);
  perform set_config(
    'request.jwt.claims',
    '{"sub":"10000000-0000-4000-8000-0000000000c7","role":"authenticated"}',
    true
  );
  execute 'set local role authenticated';
  select count(*) into room_count from public.rooms where name = 'Harbor Room';
  select count(*) into inland from public.rooms where name = 'Inland Room';
  if room_count <> 0 or inland <> 1 then
    raise exception 'cross-church rooms harbor=% inland=%', room_count, inland;
  end if;
end
$$;

do $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
  begin
    perform 1 from public.rooms;
    raise exception 'anon read rooms';
  exception
    when insufficient_privilege then
      null;
  end;
  begin
    perform public.self_register_parent('10000000-0000-4000-8000-0000000000a1');
    raise exception 'anon executed self_register_parent';
  exception
    when insufficient_privilege then
      null;
  end;
  execute 'reset role';
end
$$;

do $$
begin
  begin
    insert into public.shared_briefs (id, organization_id, child_id, room_id, sunday_id, shared, lines)
    values (
      '10000000-0000-4000-8000-0000000000b9',
      '10000000-0000-4000-8000-0000000000a1',
      '10000000-0000-4000-8000-0000000000d1',
      '10000000-0000-4000-8000-0000000000e1',
      '10000000-0000-4000-8000-0000000000f1',
      true,
      '[{"field":"medical","text":"hidden"}]'::jsonb
    );
    raise exception 'medical line was stored on a brief';
  exception
    when check_violation then
      null;
  end;
end
$$;

do $$
declare
  own_children int;
  other_children int;
  room_count int;
begin
  perform set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-0000000000c1', true);
  perform set_config(
    'request.jwt.claims',
    '{"sub":"10000000-0000-4000-8000-0000000000c1","role":"authenticated"}',
    true
  );
  execute 'set local role authenticated';
  select count(*) into own_children
  from public.children
  where id = '10000000-0000-4000-8000-0000000000d1';
  select count(*) into other_children
  from public.children
  where id = '10000000-0000-4000-8000-0000000000d2';
  select count(*) into room_count from public.rooms;
  if own_children <> 1 or other_children <> 0 then
    raise exception 'parent children own=% other=%', own_children, other_children;
  end if;
  if room_count <> 0 then
    raise exception 'parent with an assignment sees % rooms', room_count;
  end if;
  execute 'reset role';
end
$$;

do $$
declare
  own_brief int;
  other_room int;
  other_sunday int;
  medical_lines int;
  notes int;
begin
  perform set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-0000000000c3', true);
  perform set_config(
    'request.jwt.claims',
    '{"sub":"10000000-0000-4000-8000-0000000000c3","role":"authenticated"}',
    true
  );
  execute 'set local role authenticated';
  select count(*) into own_brief
  from public.shared_briefs
  where id = '10000000-0000-4000-8000-0000000000b1';
  select count(*) into other_room
  from public.shared_briefs
  where id = '10000000-0000-4000-8000-0000000000b2';
  select count(*) into other_sunday
  from public.shared_briefs
  where id = '10000000-0000-4000-8000-0000000000b3';
  select count(*) into medical_lines
  from public.shared_briefs b, jsonb_array_elements(b.lines) line
  where line->>'field' = 'medical';
  select count(*) into notes from public.medical_notes;
  if own_brief <> 1 or other_room <> 0 or other_sunday <> 0 then
    raise exception 'volunteer briefs own=% room=% sunday=%', own_brief, other_room, other_sunday;
  end if;
  if medical_lines <> 0 or notes <> 0 then
    raise exception 'volunteer medical lines=% notes=%', medical_lines, notes;
  end if;
  begin
    perform public.create_invite('10000000-0000-4000-8000-0000000000a1', 'leader');
    raise exception 'volunteer create_invite succeeded';
  exception
    when raise_exception then
      if sqlerrm is distinct from 'forbidden' then
        raise;
      end if;
  end;
  execute 'reset role';
end
$$;

do $$
declare
  harbor_church int;
  inland_church int;
  harbor_lesson int;
  inland_lesson int;
begin
  perform set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-0000000000c6', true);
  perform set_config(
    'request.jwt.claims',
    '{"sub":"10000000-0000-4000-8000-0000000000c6","role":"authenticated"}',
    true
  );
  execute 'set local role authenticated';
  select count(*) into harbor_church from public.church_setup where name = 'Harbor Church';
  select count(*) into inland_church from public.church_setup where name = 'Inland Church';
  select count(*) into harbor_lesson from public.lessons where title = 'Harbor Lesson';
  select count(*) into inland_lesson from public.lessons where title = 'Inland Lesson';
  if harbor_church <> 1 or inland_church <> 0 or harbor_lesson <> 1 or inland_lesson <> 0 then
    raise exception 'leader church harbor=% inland=% lesson harbor=% inland=%',
      harbor_church, inland_church, harbor_lesson, inland_lesson;
  end if;
  execute 'reset role';
end
$$;

do $$
declare
  memberships int;
begin
  perform set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-0000000000c5', true);
  perform set_config(
    'request.jwt.claims',
    '{"sub":"10000000-0000-4000-8000-0000000000c5","role":"authenticated"}',
    true
  );
  execute 'set local role authenticated';
  begin
    perform public.accept_invite('10000000-0000-4000-8000-0000000000a9', 'leader');
    raise exception 'mismatched accept_invite succeeded';
  exception
    when raise_exception then
      if sqlerrm is distinct from 'forbidden' then
        raise;
      end if;
  end;
  execute 'reset role';
  select count(*) into memberships
  from public.memberships
  where user_id = '10000000-0000-4000-8000-0000000000c5';
  if memberships <> 0 then
    raise exception 'mismatched accept inserted a membership';
  end if;
end
$$;

do $$
declare
  visible boolean;
begin
  update public.children
  set parent_user_id = '10000000-0000-4000-8000-0000000000c3'
  where id = '10000000-0000-4000-8000-0000000000d1';
  perform set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-0000000000c3', true);
  perform set_config(
    'request.jwt.claims',
    '{"sub":"10000000-0000-4000-8000-0000000000c3","role":"authenticated"}',
    true
  );
  execute 'set local role authenticated';
  visible := public.medical_visible('10000000-0000-4000-8000-0000000000d1');
  if visible is distinct from false then
    raise exception 'volunteer who is parent_user_id sees medical without a grant';
  end if;
  execute 'reset role';
  update public.children
  set parent_user_id = '10000000-0000-4000-8000-0000000000c1'
  where id = '10000000-0000-4000-8000-0000000000d1';
end
$$;

do $$
declare
  granted boolean;
begin
  perform set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-0000000000c1', true);
  perform set_config(
    'request.jwt.claims',
    '{"sub":"10000000-0000-4000-8000-0000000000c1","role":"authenticated"}',
    true
  );
  execute 'set local role authenticated';
  perform public.grant_medical('10000000-0000-4000-8000-0000000000d1');
  perform public.grant_medical('10000000-0000-4000-8000-0000000000d1');
  execute 'reset role';
  select g.granted into granted
  from public.medical_grants g
  where g.child_id = '10000000-0000-4000-8000-0000000000d1';
  if granted is distinct from true then
    raise exception 'parent grant stored %', granted;
  end if;

  perform set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-0000000000c3', true);
  perform set_config(
    'request.jwt.claims',
    '{"sub":"10000000-0000-4000-8000-0000000000c3","role":"authenticated"}',
    true
  );
  execute 'set local role authenticated';
  begin
    perform public.grant_medical('10000000-0000-4000-8000-0000000000d1');
    raise exception 'volunteer grant succeeded';
  exception
    when raise_exception then
      if sqlerrm is distinct from 'forbidden' then
        raise;
      end if;
  end;
  begin
    perform public.grant_medical('10000000-0000-4000-8000-000000000099');
    raise exception 'missing child grant succeeded';
  exception
    when raise_exception then
      if sqlerrm is distinct from 'not_found' then
        raise;
      end if;
  end;
  if (
    select n.note
    from public.medical_notes n
    where n.child_id = '10000000-0000-4000-8000-0000000000d1'
  ) is distinct from 'Harbor medical' then
    raise exception 'assigned volunteer cannot read the note after the grant';
  end if;
  execute 'reset role';
end
$$;

rollback;
