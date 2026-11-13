import { bindings, defineConfig, defineWorker } from 'cf/config';

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
      runWorkerFirst: ['/*'],
    },
    env: {
      ASSETS: bindings.assets(),
      READY_DEMO_MODEL: bindings.text('live'),
      AI_GATEWAY_BASE_URL: bindings.text('https://gateway.example.com/v1'),
      AI_GATEWAY_ACCOUNT_ID: bindings.text('dummy-account-not-real'),
      AI_GATEWAY_ID: bindings.text('dummy-gateway-not-real'),
      INTAKE_PROFILE_PROVIDER: bindings.text('workers-ai'),
      INTAKE_PROFILE_MODEL: bindings.text('@cf/meta/llama-3.3-70b-instruct-fp8-fast'),
      INTAKE_PROFILE_FALLBACK_PROVIDER: bindings.text('workers-ai'),
      INTAKE_PROFILE_FALLBACK_MODEL: bindings.text('@cf/meta/llama-3.1-8b-instruct'),
      AI_GATEWAY_TOKEN: bindings.secret(),
    },
  }),
});
