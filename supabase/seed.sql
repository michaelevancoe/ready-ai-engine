-- Fictional demo data. Not a real church, family, or child.
-- Avery Sampleton, parent of Rowan Sampleton, avery.parent@example.com
-- Blake Sampleton, parent of Quinn Placeholder, blake.parent@example.com
-- Cameron Placeholder, volunteer, cameron.volunteer@example.com

insert into public.organizations (id, name) values
  ('10000000-0000-4000-8000-000000000001', 'Example Harbor Fellowship');

insert into public.memberships (id, organization_id, user_id, role) values
  ('10000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000011', 'parent'),
  ('10000000-0000-4000-8000-0000000000a2', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000012', 'parent'),
  ('10000000-0000-4000-8000-0000000000a3', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000013', 'volunteer'),
  ('10000000-0000-4000-8000-0000000000a4', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000014', 'leader');

insert into public.children (id, organization_id, display_name, parent_user_id) values
  ('10000000-0000-4000-8000-000000000021', '10000000-0000-4000-8000-000000000001', 'Rowan Sampleton', '10000000-0000-4000-8000-000000000011'),
  ('10000000-0000-4000-8000-000000000022', '10000000-0000-4000-8000-000000000001', 'Quinn Placeholder', '10000000-0000-4000-8000-000000000012');

insert into public.child_profiles (
  id, organization_id, child_id, status, profile, created_by, approved_by
) values
  (
    '10000000-0000-4000-8000-000000000031',
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000021',
    'draft',
    '{"summary":"Rowan likes a quiet corner and a warning before loud music.","sensoryConsiderations":["loud music"],"supportStrategies":["offer a quiet seat"],"avoid":["surprises during songs"],"volunteerGuidance":"Offer a quiet seat and explain the next activity before it starts."}',
    '10000000-0000-4000-8000-000000000011',
    null
  ),
  (
    '10000000-0000-4000-8000-000000000032',
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000022',
    'approved',
    '{"summary":"Quinn likes a visual schedule.","sensoryConsiderations":["bright stage lights"],"supportStrategies":["share the schedule early"],"avoid":["last-minute changes"],"volunteerGuidance":"Show the schedule before the activity changes."}',
    '10000000-0000-4000-8000-000000000012',
    '10000000-0000-4000-8000-000000000012'
  );
