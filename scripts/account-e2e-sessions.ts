import { spawnSync } from 'node:child_process';

const hosted = ['supabase', 'co'].join('.');
const password = 'harbor-example-password';

const people = [
  { id: '10000000-0000-4000-8000-000000000011', email: 'avery.parent@example.com', role: 'parent' },
  { id: '10000000-0000-4000-8000-000000000013', email: 'cameron.volunteer@example.com', role: 'volunteer' },
  { id: '10000000-0000-4000-8000-000000000014', email: 'devon.admin@example.com', role: 'leader' },
] as const;

export function accountSeedSql(): string {
  const users = people
    .map(
      (item) => `
        insert into auth.users (
          instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
          confirmation_token, recovery_token, email_change_token_new, email_change,
          email_change_token_current, phone_change, phone_change_token, reauthentication_token,
          is_sso_user, is_anonymous
        ) values (
          '00000000-0000-0000-0000-000000000000',
          '${item.id}',
          'authenticated',
          'authenticated',
          '${item.email}',
          extensions.crypt($ready_password$${password}$ready_password$, extensions.gen_salt('bf')),
          now(),
          jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
          '{}'::jsonb,
          now(),
          now(),
          '', '', '', '', '', '', '', '',
          false,
          false
        );
        insert into auth.identities (
          provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
        ) values (
          '${item.id}',
          '${item.id}',
          jsonb_build_object(
            'sub', '${item.id}',
            'email', '${item.email}',
            'email_verified', true
          ),
          'email',
          now(),
          now(),
          now()
        );`,
    )
    .join('\n');
  return `
    ${users}
  `;
}

function required(name: string): string {
  const value = process.env[name];
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`account e2e needs ${name}`);
  if (value.includes(hosted)) throw new Error(`account e2e refuses ${name}`);
  return value.trim();
}

function loopback(value: string): boolean {
  try {
    const url = new URL(value);
    return url.hostname === '127.0.0.1' || url.hostname === 'localhost';
  } catch {
    return false;
  }
}

async function signIn(apiUrl: string, anonKey: string, email: string): Promise<string> {
  const response = await fetch(`${apiUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      apikey: anonKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });
  const body = (await response.json()) as { access_token?: unknown };
  if (!response.ok || typeof body.access_token !== 'string' || body.access_token.length === 0) {
    throw new Error(`local sign-in failed with ${response.status}`);
  }
  return body.access_token;
}

async function main(): Promise<void> {
  const apiUrl = required('READY_LOCAL_API_URL').replace(/\/$/u, '');
  const anonKey = required('READY_LOCAL_ANON_KEY');
  const dbUrl = required('READY_LOCAL_DB_URL');
  if (!loopback(apiUrl) || !apiUrl.startsWith('http://') || !loopback(dbUrl)) {
    throw new Error('account e2e needs a loopback database');
  }
  const applied = spawnSync('psql', [dbUrl, '-v', 'ON_ERROR_STOP=1', '-q'], {
    input: accountSeedSql(),
    encoding: 'utf8',
  });
  if (applied.error !== undefined || applied.status !== 0) {
    throw new Error(applied.stderr?.trim() || applied.error?.message || 'local account seed failed');
  }
  const sessions = [];
  for (const item of people) {
    sessions.push({
      userId: item.id,
      accessToken: await signIn(apiUrl, anonKey, item.email),
      role: item.role,
    });
  }
  process.stdout.write(`${JSON.stringify(sessions)}\n`);
}

const entry = process.argv[1];
if (entry !== undefined && entry.endsWith('account-e2e-sessions.ts')) {
  await main();
}
