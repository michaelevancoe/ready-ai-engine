import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ONBOARDING_STORAGE_KEY,
  createOnboardingStore,
  familyStartLink,
  onboardingProgress,
  reduceOnboarding,
  volunteerStartLink,
  type OnboardingAction,
  type OnboardingState,
  type OnboardingStorage,
} from './leader-onboarding.ts';

const steps = [1, 2, 3, 4] as const;

const states: readonly OnboardingState[] = [
  { status: 'new' },
  { status: 'in-progress', step: 1 },
  { status: 'in-progress', step: 2 },
  { status: 'in-progress', step: 3 },
  { status: 'in-progress', step: 4 },
  { status: 'finish' },
  { status: 'skipped', step: 1 },
  { status: 'skipped', step: 2 },
  { status: 'skipped', step: 3 },
  { status: 'skipped', step: 4 },
  { status: 'done' },
];

function same(state: OnboardingState, action: OnboardingAction): void {
  assert.equal(reduceOnboarding(state, action), state);
}

test('start opens the classroom from welcome and leaves every later screen', () => {
  assert.deepEqual(reduceOnboarding({ status: 'new' }, { type: 'start' }), {
    status: 'in-progress',
    step: 2,
  });
  assert.deepEqual(reduceOnboarding({ status: 'in-progress', step: 1 }, { type: 'start' }), {
    status: 'in-progress',
    step: 2,
  });
  for (const step of [2, 3, 4] as const) same({ status: 'in-progress', step }, { type: 'start' });
  same({ status: 'finish' }, { type: 'start' });
  same({ status: 'done' }, { type: 'start' });
  for (const step of steps) same({ status: 'skipped', step }, { type: 'start' });
});

test('next walks the four setup screens and does nothing elsewhere', () => {
  assert.deepEqual(reduceOnboarding({ status: 'in-progress', step: 1 }, { type: 'next' }), {
    status: 'in-progress',
    step: 2,
  });
  assert.deepEqual(reduceOnboarding({ status: 'in-progress', step: 2 }, { type: 'next' }), {
    status: 'in-progress',
    step: 3,
  });
  assert.deepEqual(reduceOnboarding({ status: 'in-progress', step: 3 }, { type: 'next' }), {
    status: 'in-progress',
    step: 4,
  });
  assert.deepEqual(reduceOnboarding({ status: 'in-progress', step: 4 }, { type: 'next' }), { status: 'finish' });
  same({ status: 'new' }, { type: 'next' });
  same({ status: 'finish' }, { type: 'next' });
  same({ status: 'done' }, { type: 'next' });
  for (const step of steps) same({ status: 'skipped', step }, { type: 'next' });
});

test('back moves one screen toward welcome and does nothing elsewhere', () => {
  assert.deepEqual(reduceOnboarding({ status: 'in-progress', step: 2 }, { type: 'back' }), {
    status: 'in-progress',
    step: 1,
  });
  assert.deepEqual(reduceOnboarding({ status: 'in-progress', step: 3 }, { type: 'back' }), {
    status: 'in-progress',
    step: 2,
  });
  assert.deepEqual(reduceOnboarding({ status: 'in-progress', step: 4 }, { type: 'back' }), {
    status: 'in-progress',
    step: 3,
  });
  assert.deepEqual(reduceOnboarding({ status: 'finish' }, { type: 'back' }), { status: 'in-progress', step: 4 });
  same({ status: 'new' }, { type: 'back' });
  same({ status: 'in-progress', step: 1 }, { type: 'back' });
  same({ status: 'done' }, { type: 'back' });
  for (const step of steps) same({ status: 'skipped', step }, { type: 'back' });
});

test('skip remembers where the leader was and leaves finished screens', () => {
  assert.deepEqual(reduceOnboarding({ status: 'new' }, { type: 'skip' }), { status: 'skipped', step: 1 });
  for (const step of steps) {
    assert.deepEqual(reduceOnboarding({ status: 'in-progress', step }, { type: 'skip' }), {
      status: 'skipped',
      step,
    });
  }
  same({ status: 'finish' }, { type: 'skip' });
  same({ status: 'done' }, { type: 'skip' });
  for (const step of steps) same({ status: 'skipped', step }, { type: 'skip' });
});

test('resume reopens the skipped screen and does nothing elsewhere', () => {
  for (const step of steps) {
    assert.deepEqual(reduceOnboarding({ status: 'skipped', step }, { type: 'resume' }), {
      status: 'in-progress',
      step,
    });
  }
  same({ status: 'new' }, { type: 'resume' });
  same({ status: 'finish' }, { type: 'resume' });
  same({ status: 'done' }, { type: 'resume' });
  for (const step of steps) same({ status: 'in-progress', step }, { type: 'resume' });
});

test('finish completes the reminder or the last screen and does nothing elsewhere', () => {
  assert.deepEqual(reduceOnboarding({ status: 'finish' }, { type: 'finish' }), { status: 'done' });
  for (const step of steps) {
    assert.deepEqual(reduceOnboarding({ status: 'skipped', step }, { type: 'finish' }), { status: 'done' });
  }
  same({ status: 'new' }, { type: 'finish' });
  same({ status: 'done' }, { type: 'finish' });
  for (const step of steps) same({ status: 'in-progress', step }, { type: 'finish' });
});

test('replay returns every screen to welcome', () => {
  for (const state of states) assert.deepEqual(reduceOnboarding(state, { type: 'replay' }), { status: 'new' });
});

test('a leader can move ahead, go back, skip, resume, finish, and replay', () => {
  let state: OnboardingState = { status: 'new' };
  state = reduceOnboarding(state, { type: 'start' });
  assert.deepEqual(state, { status: 'in-progress', step: 2 });
  state = reduceOnboarding(state, { type: 'next' });
  state = reduceOnboarding(state, { type: 'back' });
  assert.deepEqual(state, { status: 'in-progress', step: 2 });
  state = reduceOnboarding(state, { type: 'skip' });
  assert.deepEqual(state, { status: 'skipped', step: 2 });
  state = reduceOnboarding(state, { type: 'resume' });
  state = reduceOnboarding(state, { type: 'next' });
  state = reduceOnboarding(state, { type: 'next' });
  state = reduceOnboarding(state, { type: 'next' });
  assert.deepEqual(state, { status: 'finish' });
  state = reduceOnboarding(state, { type: 'back' });
  assert.deepEqual(state, { status: 'in-progress', step: 4 });
  state = reduceOnboarding(state, { type: 'next' });
  state = reduceOnboarding(state, { type: 'finish' });
  assert.deepEqual(state, { status: 'done' });
  assert.deepEqual(reduceOnboarding(state, { type: 'replay' }), { status: 'new' });
});

test('progress counts welcome through the volunteer link and stops after that', () => {
  assert.deepEqual(onboardingProgress({ status: 'new' }), { step: 1, of: 4 });
  for (const step of steps) {
    assert.deepEqual(onboardingProgress({ status: 'in-progress', step }), { step, of: 4 });
    assert.deepEqual(onboardingProgress({ status: 'skipped', step }), { step, of: 4 });
  }
  assert.equal(onboardingProgress({ status: 'finish' }), null);
  assert.equal(onboardingProgress({ status: 'done' }), null);
});

test('share links are the family home and the volunteer page on the given origin', () => {
  assert.equal(familyStartLink('http://127.0.0.1:3000'), 'http://127.0.0.1:3000/');
  assert.equal(volunteerStartLink('http://127.0.0.1:3000'), 'http://127.0.0.1:3000/volunteer');
});

function memory(initial: string | null = null): OnboardingStorage & { readonly raw: () => string | null } {
  let value = initial;
  return {
    getItem(key) {
      if (key !== ONBOARDING_STORAGE_KEY) return null;
      return value;
    },
    setItem(key, next) {
      if (key !== ONBOARDING_STORAGE_KEY) return;
      value = next;
    },
    raw() {
      return value;
    },
  };
}

test('storage round-trips every screen and writes only v, status, and sometimes step', () => {
  assert.equal(ONBOARDING_STORAGE_KEY, 'ready.leaderOnboarding.v1');
  for (const state of states) {
    const storage = memory();
    const store = createOnboardingStore(storage);
    store.write(state);
    assert.deepEqual(store.read(), state);
    assert.deepEqual(createOnboardingStore(storage).read(), state);
    const raw = storage.raw();
    assert.equal(typeof raw, 'string');
    const parsed: unknown = JSON.parse(raw ?? '');
    assert.equal(Array.isArray(parsed), false);
    assert.equal(typeof parsed, 'object');
    assert.notEqual(parsed, null);
    if (typeof parsed !== 'object' || parsed === null) throw new Error('stored onboarding is not an object');
    const keys = Object.keys(parsed).sort();
    if (state.status === 'in-progress' || state.status === 'skipped') {
      assert.deepEqual(keys, ['status', 'step', 'v']);
    } else {
      assert.deepEqual(keys, ['status', 'v']);
    }
    assert.equal(Reflect.get(parsed, 'v'), 1);
    assert.equal(Reflect.get(parsed, 'status'), state.status);
  }
});

test('invalid stored onboarding becomes welcome', () => {
  const invalid = [
    null,
    '',
    '{',
    'null',
    '[]',
    '1',
    '{"v":1}',
    '{"status":"done"}',
    '{"v":2,"status":"done"}',
    '{"v":"1","status":"done"}',
    '{"v":1,"status":"complete"}',
    '{"v":1,"status":"in-progress"}',
    '{"v":1,"status":"skipped"}',
    '{"v":1,"status":"in-progress","step":0}',
    '{"v":1,"status":"in-progress","step":5}',
    '{"v":1,"status":"skipped","step":"2"}',
    '{"v":1,"status":"in-progress","step":1.5}',
    '{"v":1,"status":"skipped","step":true}',
  ];
  for (const raw of invalid) {
    assert.deepEqual(createOnboardingStore(memory(raw)).read(), { status: 'new' });
  }
  assert.deepEqual(
    createOnboardingStore(memory('{"v":1,"status":"done","step":3,"church":"Example"}')).read(),
    { status: 'done' },
  );
  assert.deepEqual(
    createOnboardingStore(memory('{"v":1,"status":"in-progress","step":3,"notes":"secret"}')).read(),
    { status: 'in-progress', step: 3 },
  );
});

test('a throwing getItem, a throwing setItem, and null storage do not throw', () => {
  const blocked: OnboardingStorage = {
    getItem() {
      throw new Error('get failed');
    },
    setItem() {
      throw new Error('set failed');
    },
  };
  const fromThrow = createOnboardingStore(blocked);
  assert.doesNotThrow(() => fromThrow.read());
  assert.deepEqual(fromThrow.read(), { status: 'new' });
  const written: OnboardingState = { status: 'skipped', step: 4 };
  assert.doesNotThrow(() => fromThrow.write(written));
  assert.deepEqual(fromThrow.read(), written);

  let stored = '{"v":1,"status":"done"}';
  const rejectWrite: OnboardingStorage = {
    getItem(key) {
      return key === ONBOARDING_STORAGE_KEY ? stored : null;
    },
    setItem() {
      throw new Error('set failed');
    },
  };
  const kept = createOnboardingStore(rejectWrite);
  const next: OnboardingState = { status: 'in-progress', step: 2 };
  assert.doesNotThrow(() => kept.write(next));
  assert.deepEqual(kept.read(), next);
  assert.equal(stored, '{"v":1,"status":"done"}');
  assert.deepEqual(createOnboardingStore(rejectWrite).read(), { status: 'done' });

  const first = createOnboardingStore(null);
  const second = createOnboardingStore(null);
  assert.doesNotThrow(() => first.read());
  assert.deepEqual(first.read(), { status: 'new' });
  assert.doesNotThrow(() => first.write({ status: 'finish' }));
  assert.deepEqual(first.read(), { status: 'finish' });
  assert.deepEqual(second.read(), { status: 'new' });
});
