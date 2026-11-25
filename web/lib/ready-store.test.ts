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

test('church photos start empty, notify on change, and revoke the previous blob', () => {
  const store = new DemoStore();
  assert.deepEqual(store.getChurchPhotos(), {
    outside: null,
    doors: null,
    desk: null,
    classroom: null,
    quiet: null,
    pickup: null,
  });
  const revoked: string[] = [];
  const original = URL.revokeObjectURL;
  URL.revokeObjectURL = (url: string) => {
    revoked.push(url);
  };
  try {
    let calls = 0;
    store.subscribe(() => {
      calls += 1;
    });
    store.setChurchPhoto('desk', 'https://photos.example.com/desk.jpg');
    assert.equal(calls, 1);
    store.clearChurchPhoto('desk');
    assert.equal(calls, 2);
    assert.deepEqual(revoked, []);
    store.setChurchPhoto('desk', 'blob:http://127.0.0.1/a');
    store.setChurchPhoto('desk', 'blob:http://127.0.0.1/a');
    assert.equal(calls, 3);
    store.setChurchPhoto('desk', 'blob:http://127.0.0.1/b');
    assert.deepEqual(revoked, ['blob:http://127.0.0.1/a']);
    store.clearChurchPhoto('desk');
    store.clearChurchPhoto('desk');
    assert.equal(store.getChurchPhotos().desk, null);
    assert.equal(calls, 5);
    assert.deepEqual(revoked, ['blob:http://127.0.0.1/a', 'blob:http://127.0.0.1/b']);
  } finally {
    URL.revokeObjectURL = original;
  }
});
