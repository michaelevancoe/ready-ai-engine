import { defineConfig } from '@playwright/test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(webRoot, '..');

function demoEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value;
  }
  env.READY_LOCAL_DEMO = '1';
  env.READY_DEMO_MODEL = 'mock';
  return env;
}

export default defineConfig({
  testDir: 'e2e',
  testIgnore: 'built-worker.spec.ts',
  timeout: 60_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL: 'http://127.0.0.1:3000',
  },
  webServer: [
    {
      command: 'npm run demo',
      cwd: repoRoot,
      url: 'http://127.0.0.1:8787/healthz',
      reuseExistingServer: false,
      timeout: 120_000,
      env: demoEnv(),
    },
    {
      command: 'npm run dev',
      cwd: webRoot,
      url: 'http://127.0.0.1:3000',
      reuseExistingServer: false,
      timeout: 120_000,
      env: demoEnv(),
    },
  ],
});
