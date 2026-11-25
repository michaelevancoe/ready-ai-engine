import type { WorkerBindings } from './bindings.ts';

export const fictionalDemoEnv: WorkerBindings = {
  AI_GATEWAY_BASE_URL: 'https://gateway.example.com/v1',
  AI_GATEWAY_ACCOUNT_ID: 'dummy-account-not-real',
  AI_GATEWAY_ID: 'dummy-gateway-not-real',
  AI_GATEWAY_TOKEN: 'dummy-gateway-token-not-real',
  SUPABASE_URL: 'https://dummy-project-not-real.example.com',
  SUPABASE_ANON_KEY: 'dummy-anon-key-not-real',
  SUPABASE_JWT_SECRET: 'dummy-jwt-secret-not-real',
  INTAKE_PROFILE_PROVIDER: 'openai',
  INTAKE_PROFILE_MODEL: 'dummy-primary-model-not-real',
  INTAKE_PROFILE_FALLBACK_PROVIDER: 'workers-ai',
  INTAKE_PROFILE_FALLBACK_MODEL: 'dummy-fallback-model-not-real',
};
