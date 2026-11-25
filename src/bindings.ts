export interface WorkerBindings {
  AI_GATEWAY_BASE_URL: string;
  AI_GATEWAY_ACCOUNT_ID: string;
  AI_GATEWAY_ID: string;
  AI_GATEWAY_TOKEN: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_JWT_SECRET: string;
  INTAKE_PROFILE_PROVIDER: string;
  INTAKE_PROFILE_MODEL: string;
  INTAKE_PROFILE_FALLBACK_PROVIDER: string;
  INTAKE_PROFILE_FALLBACK_MODEL: string;
  READY_SIGN_IN?: string;
  READY_MODE?: string;
}
