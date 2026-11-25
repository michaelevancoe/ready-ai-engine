import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resetAccountVisit } from '../web/server/visit-reset.ts';

test('visit reset stays closed unless the local account e2e flag is on', async () => {
  const previousFlag = process.env.READY_ACCOUNT_E2E;
  const previousDb = process.env.READY_LOCAL_DB_URL;
  delete process.env.READY_ACCOUNT_E2E;
  delete process.env.READY_LOCAL_DB_URL;
  assert.equal((await resetAccountVisit()).status, 404);
  process.env.READY_ACCOUNT_E2E = '1';
  assert.equal((await resetAccountVisit()).status, 404);
  process.env.READY_LOCAL_DB_URL = 'postgresql://postgres:postgres@db.example:5432/postgres';
  assert.equal((await resetAccountVisit()).status, 404);
  process.env.READY_LOCAL_DB_URL = 'https://127.0.0.1:54322/postgres';
  assert.equal((await resetAccountVisit()).status, 404);
  if (previousFlag === undefined) delete process.env.READY_ACCOUNT_E2E;
  else process.env.READY_ACCOUNT_E2E = previousFlag;
  if (previousDb === undefined) delete process.env.READY_LOCAL_DB_URL;
  else process.env.READY_LOCAL_DB_URL = previousDb;
});
