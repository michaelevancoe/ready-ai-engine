import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DemoStore } from './ready-store.ts';

test('a demo store keeps the visit in memory and a new store starts empty', () => {
  const store = new DemoStore();
  let calls = 0;
  const stop = store.subscribe(() => {
    calls += 1;
  });
  store.dispatch({ type: 'role', role: 'parent' });
  assert.equal(calls, 0);
  store.dispatch({ type: 'saveNotes', notes: 'A quiet corner.' });
  assert.equal(calls, 1);
  assert.equal(store.getState().notes, 'A quiet corner.');
  assert.equal(store.getState().role, 'parent');
  stop();
  store.dispatch({ type: 'saveChurch', church: { ...store.getState().church, name: 'Example Harbor Fellowship' } });
  assert.equal(calls, 1);
  const fresh = new DemoStore();
  assert.equal(fresh.getState().notes, '');
  assert.equal(fresh.getState().church.name, 'Example Harbor Fellowship');
  assert.equal(store.getState().notes, 'A quiet corner.');
});
