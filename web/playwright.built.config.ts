import { defineConfig } from '@playwright/test';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: 'e2e',
  testMatch: [
    'built-worker.spec.ts',
    'built-worker-flows.spec.ts',
    'print-book.spec.ts',
    'lesson-removed.spec.ts',
    'demo-roster.spec.ts',
  ],
  timeout: 60_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL: 'http://127.0.0.1:4173',
  },
  webServer: {
    command: 'node --experimental-strip-types ../test/serve-built-demo.ts',
    cwd: webRoot,
    url: 'http://127.0.0.1:4173/',
    reuseExistingServer: false,
    timeout: 60_000,
    env: { BUILT_DEMO_PORT: '4173' },
  },
});
