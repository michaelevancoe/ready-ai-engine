import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initialGate, reduceGate, type ProfileId, type ShownProfile } from './desk.ts';

function shown(status: 'draft' | 'approved'): ShownProfile {
  return {
    id: '10000000-0000-4000-8000-000000000031' as ProfileId,
    status,
    sections: [
      { heading: 'Summary', lines: ['Rowan, age 7.'] },
      { heading: 'Sensory considerations', lines: ['TICK-QUIET-ROOM'] },
      { heading: 'Support strategies', lines: ['A warning before music.'] },
      { heading: 'Avoid', lines: ['Surprise loud songs.'] },
      { heading: 'Volunteer guidance', lines: ['Explain the next activity first.'] },
    ],
    whatHelps: [],
  };
}

test('approve from idle stays idle', () => {
  const gate = initialGate();
  assert.equal(reduceGate(gate, { type: 'approve' }), gate);
  assert.equal(reduceGate(gate, { type: 'approved', profile: shown('approved') }), gate);
});

test('a second approved event stays approved', () => {
  const profile = shown('draft');
  const submitting = reduceGate(initialGate(), { type: 'submit', nonce: 1 });
  const draft = reduceGate(submitting, { type: 'draft', profile, nonce: 1 });
  const approving = reduceGate(draft, { type: 'approve' });
  const approvedProfile = { ...profile, status: 'approved' as const };
  const approved = reduceGate(approving, { type: 'approved', profile: approvedProfile });
  const again = reduceGate(approved, { type: 'approved', profile: approvedProfile });
  assert.equal(submitting.status, 'submitting');
  assert.equal(draft.status, 'draft');
  if (draft.status !== 'draft') return;
  assert.equal(draft.profile.sections[1]?.lines[0], 'TICK-QUIET-ROOM');
  assert.equal(approving.status, 'approving');
  assert.equal(approved.status, 'approved');
  assert.equal(again.status, 'approved');
  if (again.status !== 'approved') return;
  assert.equal(again.profile.status, 'approved');
  assert.deepEqual(again.profile.sections, profile.sections);
  assert.equal(reduceGate(draft, { type: 'submit', nonce: 1 }), draft);
  assert.equal(reduceGate(approved, { type: 'approve' }), approved);
});

test('a failed submit keeps no profile and dismiss returns to idle', () => {
  const submitting = reduceGate(initialGate(), { type: 'submit', nonce: 1 });
  const failed = reduceGate(submitting, { type: 'fail', message: 'Check the answers and try again.', nonce: 1 });
  assert.equal(failed.status, 'error');
  if (failed.status !== 'error') return;
  assert.equal(failed.retry, 'submit');
  assert.equal(failed.profile, null);
  assert.equal(failed.message, 'Check the answers and try again.');
  const idle = reduceGate(failed, { type: 'dismiss' });
  assert.equal(idle.status, 'idle');
  const retry = reduceGate(failed, { type: 'submit', nonce: 1 });
  assert.equal(retry.status, 'submitting');
});

test('a late draft from an older submit does not replace the one in flight', () => {
  const older = shown('draft');
  const newer = {
    ...older,
    sections: older.sections.map((section) =>
      section.heading === 'Sensory considerations' ? { ...section, lines: ['TICK-SOFTER-SEAT'] } : section,
    ),
  };
  const inFlight = reduceGate(initialGate(), { type: 'submit', nonce: 2 });
  const ignored = reduceGate(inFlight, { type: 'draft', profile: older, nonce: 1 });
  assert.equal(ignored, inFlight);
  const applied = reduceGate(inFlight, { type: 'draft', profile: newer, nonce: 2 });
  assert.equal(applied.status, 'draft');
  if (applied.status !== 'draft') return;
  assert.equal(applied.profile.sections[1]?.lines[0], 'TICK-SOFTER-SEAT');
});

test('a failed approve keeps the draft profile', () => {
  const profile = shown('draft');
  const draft = reduceGate(reduceGate(initialGate(), { type: 'submit', nonce: 1 }), { type: 'draft', profile, nonce: 1 });
  const approving = reduceGate(draft, { type: 'approve' });
  const failed = reduceGate(approving, { type: 'fail', message: 'The request failed.' });
  assert.equal(failed.status, 'error');
  if (failed.status !== 'error') return;
  assert.equal(failed.retry, 'approve');
  assert.equal(failed.profile, profile);
  const back = reduceGate(failed, { type: 'dismiss' });
  assert.equal(back.status, 'draft');
  if (back.status !== 'draft') return;
  assert.equal(back.profile, profile);
  assert.equal(reduceGate(back, { type: 'approve' }).status, 'approving');
});
