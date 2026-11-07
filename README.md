# Ready AI Engine

Backend for Ready. A parent's intake answers become a **draft** child profile through one model call. A parent of that child approves the draft before a volunteer can see it. Nothing in this repository is deployed.

The Worker is the only model caller. Every call goes through Cloudflare AI Gateway. Supabase stores organizations, memberships, children, and child profiles, and enforces row-level security.

## Configuration

Account-specific values come from the environment. Provider and model names for `POST /v1/intake/profile` come from `wrangler.toml` `[vars]` (override them in `.dev.vars` for local runs).

| Name | Where | Purpose |
| --- | --- | --- |
| `AI_GATEWAY_BASE_URL` | secret | Gateway origin plus `/v1`, no account id |
| `AI_GATEWAY_ACCOUNT_ID` | secret | Cloudflare account id |
| `AI_GATEWAY_ID` | secret | AI Gateway id |
| `AI_GATEWAY_TOKEN` | secret | `cf-aig-authorization` bearer token |
| `SUPABASE_URL` | secret | Supabase project URL |
| `SUPABASE_ANON_KEY` | secret | Supabase anon key. The Worker forwards the user JWT so RLS applies |
| `SUPABASE_JWT_SECRET` | secret | HMAC secret for the project JWT (`sub` is the user id) |
| `INTAKE_PROFILE_PROVIDER` | var | Primary provider slug |
| `INTAKE_PROFILE_MODEL` | var | Primary model id |
| `INTAKE_PROFILE_FALLBACK_PROVIDER` | var | Fallback provider slug |
| `INTAKE_PROFILE_FALLBACK_MODEL` | var | Fallback model id |

`generate()` builds the OpenAI-compatible chat-completions URL from the gateway base, account id, and gateway id, then appends `/compat/chat/completions`. The request model is `{provider}/{model}`. On a schema failure or a gateway error it retries the primary model once, then calls the fallback model once. Logs contain the endpoint, attempt, provider, model, and outcome. They do not contain prompts, intake answers, or profile text. Gateway payload logging is turned off with `cf-aig-collect-log-payload: false`.

Copy `.dev.vars.example` to `.dev.vars` and replace the placeholders. `.dev.vars` is gitignored.

```bash
npm ci
npm run typecheck
npm test
```

Tests mock the network. They do not need Cloudflare or Supabase credentials.

## Access

Membership roles are `admin`, `parent`, and `volunteer`. `children.parent_user_id` is the parent of that child.

| Action | Who |
| --- | --- |
| Create a draft (`POST /v1/intake/profile`) | The child's parent |
| Read a draft | That child's parent, and organization admins |
| Approve a draft (`POST /v1/profiles/:id/approve`) | That child's parent |
| Read an approved profile | Any member of the organization, including volunteers |

Volunteers never see drafts. Another parent in the same organization does not see or approve this child's draft. The service role is not used by the Worker.

## Move to team-owned accounts

1. Create the team Cloudflare account and an AI Gateway in that account. This repository does not create accounts or cloud resources.
2. Put the team gateway base URL, account id, gateway id, and gateway token in Worker secrets. For local runs, put them in `.dev.vars`.
3. Keep provider credentials in the gateway (bring-your-own key or unified billing). Do not add provider API keys to this repository.
4. Change the `INTAKE_PROFILE_*` vars in `wrangler.toml` if the team uses different providers or models.
5. Create the team Supabase project. Apply `supabase/migrations`. Load `supabase/seed.sql` only for a demo. The seed is fictional.
6. Put the Supabase URL, anon key, and JWT secret in Worker secrets. Replace the seed's user ids with that project's auth user ids before using the seed against a real project.
7. Search tracked files for account ids, gateway hosts, and keys. Placeholders belong only in `.dev.vars.example`.
8. Run the probe (`npm ci`, `npm run typecheck`, `npm test`) before any later stage that deploys. This stage does not deploy.
