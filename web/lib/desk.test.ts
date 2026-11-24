import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  initialPhase,
  readAnswers,
  reducePage,
  viewOf,
  type PagePhase,
  type ProfileId,
  type ProfileSectionKey,
  type ShownProfile,
} from './desk.ts';

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
  };
}

test('approve from ready stays ready', () => {
  const phase = initialPhase();
  assert.equal(reducePage(phase, { type: 'approve' }), phase);
  assert.equal(viewOf(phase).primary, 'submit');
});

test('a second approved event stays approved', () => {
  const ready = initialPhase();
  const profile = shown('draft');
  const submitting = reducePage(ready, { type: 'submit', answers: ready.answers });
  const draft = reducePage(submitting, { type: 'draft', profile });
  const approving = reducePage(draft, { type: 'approve' });
  const approvedProfile = { ...profile, status: 'approved' as const };
  const approved = reducePage(approving, { type: 'approved', profile: approvedProfile });
  const again = reducePage(approved, { type: 'approved', profile: approvedProfile });
  assert.equal(submitting.status, 'submitting');
  assert.equal(draft.status, 'draft');
  assert.equal(viewOf(draft).primary, 'approve');
  assert.equal(viewOf(draft).statusLabel, 'Draft');
  assert.equal(viewOf(draft).sections[1]?.lines[0], 'TICK-QUIET-ROOM');
  assert.equal(approving.status, 'approving');
  assert.equal(viewOf(approving).primary, null);
  assert.equal(viewOf(approving).banner?.text, 'Approving the profile.');
  assert.equal(approved.status, 'approved');
  assert.equal(again.status, 'approved');
  assertApproved(again);
  assert.equal(viewOf(again).statusLabel, 'Approved');
  assert.deepEqual(viewOf(again).sections, profile.sections);
});

test('a failed submit shows the message and keeps no profile', () => {
  const ready = initialPhase();
  const submitting = reducePage(ready, { type: 'submit', answers: ready.answers });
  const failed = reducePage(submitting, { type: 'fail', message: 'Check the answers and try again.' });
  assert.equal(failed.status, 'error');
  if (failed.status !== 'error') return;
  assert.equal(failed.retry, 'submit');
  assert.equal(failed.profile, null);
  assert.equal(viewOf(failed).banner?.text, 'Check the answers and try again.');
  assert.equal(viewOf(failed).banner?.tone, 'error');
  assert.equal(viewOf(submitting).banner?.text, 'Writing the draft.');
  assert.equal(viewOf(submitting).banner?.tone, 'busy');
});

test('a bad age is a field error', () => {
  const bad = readAnswers({ ...initialPhase().answers, ageYears: '7.5' });
  assert.equal(bad.ok, false);
  if (bad.ok) return;
  assert.equal(bad.fieldErrors[0]?.field, 'ageYears');
  assert.equal(bad.fieldErrors[0]?.message, 'Enter a whole age from 0 through 18.');
  const ready = reducePage(initialPhase(), {
    type: 'invalid',
    answers: bad.draft,
    fieldErrors: bad.fieldErrors,
  });
  assert.equal(ready.status, 'ready');
  assert.equal(viewOf(ready).fields.find((field) => field.key === 'ageYears')?.error, bad.fieldErrors[0]?.message);

  const child = readAnswers({ ...initialPhase().answers, ageYears: '0' });
  const older = readAnswers({ ...initialPhase().answers, ageYears: '18' });
  const tooOld = readAnswers({ ...initialPhase().answers, ageYears: '19' });
  assert.equal(child.ok, true);
  assert.equal(older.ok, true);
  assert.equal(tooOld.ok, false);
  if (!child.ok) return;
  assert.equal(child.answers.ageYears, 0);
});

test('readAnswers leaves name length to the engine', () => {
  const result = readAnswers({ ...initialPhase().answers, preferredName: 'R'.repeat(81) });
  assert.equal(result.ok, true);
});

test('a fix returns to the matching intake field and the next draft can be approved', () => {
  const ready = initialPhase();
  const profile = shown('draft');
  const draft = reducePage(reducePage(ready, { type: 'submit', answers: ready.answers }), {
    type: 'draft',
    profile,
  });
  assert.equal(reducePage(draft, { type: 'fix', section: 'avoid', reason: '   ' }), draft);
  assert.equal(reducePage(ready, { type: 'fix', section: 'summary', reason: 'The name.' }), ready);

  const summary = sendFix(draft, 'summary', ' The name. ');
  assertFocus(summary, draft, 'preferredName', 'The name.');
  const sensory = sendFix(draft, 'sensoryConsiderations', 'Too loud.');
  assertFocus(sensory, draft, 'sensoryNotes', 'Too loud.');
  const support = sendFix(draft, 'supportStrategies', 'A warning.');
  assertFocus(support, draft, 'whatHelps', 'A warning.');
  const avoid = sendFix(draft, 'avoid', 'Skip the song.');
  assertFocus(avoid, draft, 'whatToAvoid', 'Skip the song.');
  const guidance = sendFix(draft, 'volunteerGuidance', 'Say what is next.');
  assertFocus(guidance, draft, 'whatHelps', 'Say what is next.');

  const quietAnswers = { ...ready.answers, whatHelps: '' };
  const quietDraft = reducePage(reducePage(ready, { type: 'submit', answers: quietAnswers }), {
    type: 'draft',
    profile,
  });
  assertFocus(sendFix(quietDraft, 'supportStrategies', 'A seat.'), quietDraft, 'supportNeeds', 'A seat.');
  assertFocus(sendFix(quietDraft, 'volunteerGuidance', 'Say what is next.'), quietDraft, 'whatHelps', 'Say what is next.');

  const neither = { ...ready.answers, whatHelps: '', supportNeeds: '' };
  const neitherDraft = reducePage(reducePage(ready, { type: 'submit', answers: neither }), {
    type: 'draft',
    profile,
  });
  assertFocus(sendFix(neitherDraft, 'supportStrategies', 'Nothing listed.'), neitherDraft, 'supportNeeds', 'Nothing listed.');

  assert.equal(viewOf(sensory).primary, 'submit');
  const later = reducePage(reducePage(sensory, { type: 'submit', answers: sensory.answers }), {
    type: 'draft',
    profile,
  });
  assert.equal(later.status, 'draft');
  assert.equal(viewOf(later).primary, 'approve');
});

function sendFix(phase: PagePhase, section: ProfileSectionKey, reason: string): PagePhase {
  return reducePage(phase, { type: 'fix', section, reason });
}

function assertFocus(phase: PagePhase, draft: PagePhase, field: string, reason: string): void {
  assert.equal(phase.status, 'ready');
  assert.equal(draft.status, 'draft');
  if (phase.status !== 'ready' || draft.status !== 'draft') return;
  assert.notEqual(phase.focus, 'ageYears');
  assert.equal(phase.focus, field);
  assert.equal(phase.fixReason, reason);
  assert.deepEqual(phase.answers, draft.answers);
  assert.equal(viewOf(phase).primary, 'submit');
}

function assertApproved(phase: PagePhase): void {
  assert.equal(phase.status, 'approved');
  if (phase.status !== 'approved') return;
  assert.equal(phase.profile.status, 'approved');
}
