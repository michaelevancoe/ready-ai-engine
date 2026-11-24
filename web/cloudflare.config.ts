import { bindings, defineConfig, defineWorker } from 'cf/config';

function deployValue(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value === undefined || value === '' ? fallback : value;
}

export default defineConfig({
  worker: defineWorker({
    name: 'ready-demo',
    entrypoint: './worker/index.ts',
    compatibilityDate: '2026-11-13',
    workersDev: true,
    previewUrls: false,
    assets: {
      htmlHandling: 'none',
      notFoundHandling: 'none',
      runWorkerFirst: ['/*', '!/_next/static/*', '!/*/_next/static/*'],
    },
    env: {
      ASSETS: bindings.assets(),
      READY_DEMO_MODEL: bindings.text('live'),
      AI_GATEWAY_BASE_URL: bindings.text(deployValue('AI_GATEWAY_BASE_URL', 'https://gateway.example.com/v1')),
      AI_GATEWAY_ACCOUNT_ID: bindings.text(deployValue('AI_GATEWAY_ACCOUNT_ID', 'dummy-account-not-real')),
      AI_GATEWAY_ID: bindings.text(deployValue('AI_GATEWAY_ID', 'dummy-gateway-not-real')),
      INTAKE_PROFILE_PROVIDER: bindings.text('workers-ai'),
      INTAKE_PROFILE_MODEL: bindings.text('@cf/meta/llama-3.3-70b-instruct-fp8-fast'),
      INTAKE_PROFILE_FALLBACK_PROVIDER: bindings.text('workers-ai'),
      INTAKE_PROFILE_FALLBACK_MODEL: bindings.text('@cf/meta/llama-3.1-8b-instruct'),
      AI_GATEWAY_TOKEN: bindings.secret(),
    },
  }),
});
