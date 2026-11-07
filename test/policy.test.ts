import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authorize, type AccessAction, type ProfileStatus, type Role } from '../src/policy.ts';

interface Case {
  action: AccessAction;
  role: Role | null;
  sameOrganization: boolean;
  isChildParent: boolean;
  profileStatus?: ProfileStatus;
  allow: boolean;
}

const matrix: Case[] = [
  { action: 'intake.create', role: 'parent', sameOrganization: true, isChildParent: true, allow: true },
  { action: 'intake.create', role: 'parent', sameOrganization: true, isChildParent: false, allow: false },
  { action: 'intake.create', role: 'admin', sameOrganization: true, isChildParent: true, allow: false },
  { action: 'intake.create', role: 'volunteer', sameOrganization: true, isChildParent: true, allow: false },
  { action: 'intake.create', role: 'parent', sameOrganization: false, isChildParent: true, allow: false },
  { action: 'intake.create', role: null, sameOrganization: true, isChildParent: true, allow: false },

  { action: 'profile.read_draft', role: 'volunteer', sameOrganization: true, isChildParent: false, allow: false },
  { action: 'profile.read_draft', role: 'volunteer', sameOrganization: true, isChildParent: true, allow: false },
  { action: 'profile.read_draft', role: 'parent', sameOrganization: true, isChildParent: false, allow: false },
  { action: 'profile.read_draft', role: 'parent', sameOrganization: true, isChildParent: true, allow: true },
  { action: 'profile.read_draft', role: 'admin', sameOrganization: true, isChildParent: false, allow: true },
  { action: 'profile.read_draft', role: 'admin', sameOrganization: false, isChildParent: false, allow: false },

  { action: 'profile.read_approved', role: 'volunteer', sameOrganization: true, isChildParent: false, allow: true },
  { action: 'profile.read_approved', role: 'parent', sameOrganization: true, isChildParent: false, allow: true },
  { action: 'profile.read_approved', role: 'admin', sameOrganization: true, isChildParent: false, allow: true },
  { action: 'profile.read_approved', role: 'volunteer', sameOrganization: false, isChildParent: false, allow: false },

  {
    action: 'profile.approve',
    role: 'parent',
    sameOrganization: true,
    isChildParent: true,
    profileStatus: 'draft',
    allow: true,
  },
  {
    action: 'profile.approve',
    role: 'parent',
    sameOrganization: true,
    isChildParent: true,
    profileStatus: 'approved',
    allow: false,
  },
  {
    action: 'profile.approve',
    role: 'parent',
    sameOrganization: true,
    isChildParent: false,
    profileStatus: 'draft',
    allow: false,
  },
  {
    action: 'profile.approve',
    role: 'admin',
    sameOrganization: true,
    isChildParent: true,
    profileStatus: 'draft',
    allow: false,
  },
  {
    action: 'profile.approve',
    role: 'volunteer',
    sameOrganization: true,
    isChildParent: true,
    profileStatus: 'draft',
    allow: false,
  },
  {
    action: 'profile.approve',
    role: 'parent',
    sameOrganization: false,
    isChildParent: true,
    profileStatus: 'draft',
    allow: false,
  },
];

test('policy matrix matches authorize()', () => {
  for (const item of matrix) {
    assert.equal(
      authorize(item),
      item.allow,
      `${item.role ?? 'none'} ${item.action} parent=${String(item.isChildParent)} org=${String(item.sameOrganization)}`,
    );
  }
});

test('volunteers never receive a draft allow in the matrix', () => {
  const volunteerDrafts = matrix.filter(
    (item) => item.role === 'volunteer' && (item.action === 'profile.read_draft' || item.action === 'profile.approve'),
  );
  assert.ok(volunteerDrafts.length >= 2);
  assert.equal(
    volunteerDrafts.every((item) => item.allow === false),
    true,
  );
});
