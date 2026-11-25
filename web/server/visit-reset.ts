import { spawnSync } from 'node:child_process';
import { bumpE2eEpoch, withE2eLock } from './e2e-epoch.ts';
import { envValue } from './local-api.ts';

const resetSql = `
delete from public.brief_publications;
delete from public.parent_briefs;
delete from public.intake_answers;
delete from public.volunteer_notes;
delete from public.sunday_updates;
delete from public.lessons;
delete from public.church_setup;
`;

export async function resetAccountVisit(): Promise<Response> {
  if (envValue('READY_ACCOUNT_E2E') !== '1') return new Response(null, { status: 404 });
  const dbUrl = envValue('READY_LOCAL_DB_URL');
  if (dbUrl === undefined || !loopbackPostgres(dbUrl)) {
    return new Response(null, { status: 404 });
  }
  return withE2eLock(async () => {
    bumpE2eEpoch();
    const applied = spawnSync('psql', [dbUrl, '-v', 'ON_ERROR_STOP=1', '-q'], {
      input: resetSql,
      encoding: 'utf8',
    });
    if (applied.error !== undefined || applied.status !== 0) return new Response(null, { status: 500 });
    return new Response(null, { status: 204 });
  });
}

function loopbackPostgres(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') return false;
  return url.hostname === '127.0.0.1' || url.hostname === 'localhost';
}
