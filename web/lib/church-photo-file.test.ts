import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isChurchPhotoFile } from './church-photo-file.ts';

test('a church photo file is a jpeg, png, or webp', () => {
  assert.equal(isChurchPhotoFile({ type: 'image/jpeg' }), true);
  assert.equal(isChurchPhotoFile({ type: 'image/png' }), true);
  assert.equal(isChurchPhotoFile({ type: 'image/webp' }), true);
  assert.equal(isChurchPhotoFile({ type: 'image/gif' }), false);
  assert.equal(isChurchPhotoFile({ type: '' }), false);
});
