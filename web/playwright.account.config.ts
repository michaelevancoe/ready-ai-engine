import { defineConfig } from '@playwright/test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(webRoot, '..');

function required(name: string): string {
  const value = process.env[name];
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`account e2e needs ${name}`);
  return value;
}

const demoEngineEnv = {
  READY_LOCAL_DEMO: '1',
  READY_DEMO_MODEL: 'mock',
};

export default defineConfig({
  testDir: 'e2e',
  testIgnore: 'built-worker.spec.ts',
  timeout: 60_000,
  workers: 1,
  expect: { timeout: 30_000 },
  use: {
    baseURL: 'http://127.0.0.1:3000',
  },
  webServer: [
    {
      command:
        'env -u READY_VISIT_STORE -u READY_SIGN_IN -u READY_MODE -u READY_ACCOUNT_SESSIONS -u READY_LOCAL_API_URL -u READY_LOCAL_ANON_KEY npm run demo',
      cwd: repoRoot,
      url: 'http://127.0.0.1:8787/healthz',
      reuseExistingServer: false,
      timeout: 120_000,
      env: demoEngineEnv,
    },
    {
      command: 'npm run dev',
      cwd: webRoot,
      url: 'http://127.0.0.1:3000',
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...demoEngineEnv,
        READY_VISIT_STORE: 'account',
        READY_ACCOUNT_E2E: '1',
        READY_LOCAL_API_URL: required('READY_LOCAL_API_URL'),
        READY_LOCAL_ANON_KEY: required('READY_LOCAL_ANON_KEY'),
        READY_LOCAL_DB_URL: required('READY_LOCAL_DB_URL'),
        READY_ACCOUNT_SESSIONS: required('READY_ACCOUNT_SESSIONS'),
      },
    },
  ],
});
