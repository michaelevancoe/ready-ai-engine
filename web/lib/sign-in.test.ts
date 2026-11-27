import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CHURCHES, INACTIVE_BODY, headerTone, reduceSignIn, type SignInView } from './sign-in.ts';

test('the sample church is Example Harbor Fellowship', () => {
  assert.equal(CHURCHES[0]?.id, 'harbor');
  assert.equal(CHURCHES[0]?.name, 'Example Harbor Fellowship');
  assert.equal(CHURCHES[1]?.name, 'Riverside Fellowship');
});

test('the header color follows the role', () => {
  assert.equal(headerTone('Parent'), 'parent');
  assert.equal(headerTone('Volunteer'), 'volunteer');
  assert.equal(headerTone('Leader'), 'leader');
});

test('any address gets the check-email screen', () => {
  const addresses = ['maya.parent@example.com', 'not-on-the-list@example.com', 'someone@example.com'];
  for (const email of addresses) {
    const next = reduceSignIn({ kind: 'email' }, { type: 'send', email: `  ${email}  ` });
    assert.deepEqual(next, { kind: 'check', email });
  }
  assert.deepEqual(reduceSignIn({ kind: 'email' }, { type: 'send', email: '   ' }), { kind: 'email' });
});

test('an inactive link is one screen and does not name a single cause', () => {
  const check: SignInView = { kind: 'check', email: 'maya.parent@example.com' };
  const next = reduceSignIn(check, { type: 'inactive' });
  assert.deepEqual(next, { kind: 'inactive', email: 'maya.parent@example.com' });
  assert.equal(INACTIVE_BODY.includes('expired'), true);
  assert.equal(INACTIVE_BODY.includes('invite list'), true);
  assert.equal(next.kind, 'inactive');
});

test('choosing a church then leaving it returns to the same email', () => {
  const chosen = reduceSignIn(
    { kind: 'choose', email: 'maya.parent@example.com', churchId: 'grace' },
    { type: 'choose', churchId: 'riverside' },
  );
  const signedIn = reduceSignIn(chosen, { type: 'continue' });
  assert.equal(signedIn.kind, 'app');
  if (signedIn.kind !== 'app') return;
  assert.equal(signedIn.churchId, 'riverside');
  assert.equal(signedIn.menu, false);
  const open = reduceSignIn(signedIn, { type: 'menu' });
  assert.equal(open.kind, 'app');
  if (open.kind !== 'app') return;
  assert.equal(open.menu, true);
  const again = reduceSignIn(open, { type: 'switch' });
  assert.deepEqual(again, { kind: 'choose', email: 'maya.parent@example.com', churchId: 'riverside' });
  assert.deepEqual(reduceSignIn(signedIn, { type: 'signOut' }), { kind: 'email' });
});
