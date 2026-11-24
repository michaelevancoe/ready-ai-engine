# Ready AI Engine

Backend for Ready. A parent's intake answers become a **draft** child profile through one model call. A parent of that child approves the draft before a volunteer can see it. CI does not deploy this repository. The shareable demo section tells you how to publish the local demo by hand.

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
| `SUPABASE_ANON_KEY` | secret | Supabase anon key. The Worker forwards the user JWT so RLS applies. The sign-in adapter also sends this value as `apikey` when it checks a session |
| `SUPABASE_JWT_SECRET` | secret | HMAC secret for the project JWT (`sub` is the user id) |
| `INTAKE_PROFILE_PROVIDER` | var | Primary provider slug |
| `INTAKE_PROFILE_MODEL` | var | Primary model id |
| `INTAKE_PROFILE_FALLBACK_PROVIDER` | var | Fallback provider slug |
| `INTAKE_PROFILE_FALLBACK_MODEL` | var | Fallback model id |
| `READY_SIGN_IN` | unset | Engine access routes. Only the exact value `on` opens them. The demo worker does not read it. |

`generate()` builds the OpenAI-compatible chat-completions URL from the gateway base, account id, and gateway id, then appends `/compat/chat/completions`. The request model is `{provider}/{model}`. On a schema failure or a gateway error it retries the primary model once, then calls the fallback model once. Logs contain the endpoint, attempt, provider, model, and outcome. They do not contain prompts, intake answers, or profile text. Gateway payload logging is turned off with `cf-aig-collect-log-payload: false`.

Copy `.dev.vars.example` to `.dev.vars` and replace the placeholders. `.dev.vars` is gitignored.

```bash
npm ci
npm run typecheck
npm test
```

Tests mock the network. They do not need Cloudflare or Supabase credentials.

## Local demo

Run the demo on this machine for Avery Sampleton, parent of Rowan Sampleton, in Example Harbor Fellowship. The parent page has six fields. Submit the form to see a Draft view of the five sections. Approve that draft to see Approved.

The demo process keeps the fictional church in memory and signs the Avery session on each request. The page posts to its own address. It forwards `/v1` to that process only when `READY_LOCAL_DEMO` is `1`. `npm run demo` does not set that variable.

The demo uses the mock unless you set `READY_DEMO_MODEL` to `live`. Any other value, including an unset value, keeps the mock. The mock writes the draft from the six answers and does not call a model.

### Three roles

**Parent**, **Volunteer**, and **Leader** are links at the top. They share one visit in the browser. A refresh resets that visit. Mock mode stays the default.

Avery Sampleton uses Parent to approve Rowan's profile and a Sunday brief. Avery does not write the Sunday update. The brief keeps the visible fields that have text at the moment of approval. The medical field starts off. Avery must turn it on and approve again before the brief includes it. Avery sees the Sunday update only after Devon approves it.

Theo Park uses Volunteer to read that brief and save notes after Sunday. Those notes stay on the volunteer and leader screens. Volunteer shows no profile text before the brief is approved. Volunteer sees the lesson only after Devon approves it.

Devon Placeholder uses Leader to edit the church and adapt a fictional lesson. Devon writes a separate parent note and approves it. Devon approves the lesson before a volunteer sees it. **Adapt lesson** stays off until the Sunday brief is approved. The lesson uses that approved brief.

From the repo root, install, check, and test. Then start the demo process.

```bash
npm ci
npm run typecheck
npm test
READY_LOCAL_DEMO=1 npm run demo
```

In a second terminal, install and start the page.

```bash
cd web
npm ci
READY_LOCAL_DEMO=1 npm run dev
```

Open http://127.0.0.1:3000.

Inside `web`, run `npm run typecheck`. Run `npm run build`. Run `npm run test:e2e`. The build does not need `READY_LOCAL_DEMO`.

To turn live mode on, copy `.dev.vars.example` to `.dev.vars`. `.dev.vars` is gitignored. Set `READY_DEMO_MODEL=live` in the shell or in `.dev.vars`.

Set `AI_GATEWAY_BASE_URL` to `https://gateway.ai.cloudflare.com/v1` with no account id in that value. Set `AI_GATEWAY_ID` to `ready-demo`. Set `AI_GATEWAY_ACCOUNT_ID` and `AI_GATEWAY_TOKEN` from the Cloudflare account. Set both `INTAKE_PROFILE_PROVIDER` and `INTAKE_PROFILE_FALLBACK_PROVIDER` to `workers-ai`.

The token needs the `AI Gateway: Run` permission and the `Workers AI: Read` permission on that one account. Prefer a token with an expiry.

The gateway allows 20 requests per 60 seconds on a sliding window. One submit can send up to three calls. The calls are the primary model, one retry, and then the fallback model.

When the model fails or the rate limit is hit, the page shows the alert `The draft could not be written. Submit the form again.`

Start the live demo with this command.

```bash
READY_LOCAL_DEMO=1 READY_DEMO_MODEL=live npm run demo
```

The page process stays `READY_LOCAL_DEMO=1 npm run dev`.

The demo still sends only the six fictional answer fields. The request does not include a real Supabase token. The process does not log the gateway token.

## Shareable demo

Publish the page and the in-memory engine as one Worker named `ready-demo`. It is an unlisted `workers.dev` hostname with no sign-in. `web/cloudflare.config.ts` sets `workersDev` to true and `previewUrls` to false. Those fields are `workers_dev` and `preview_urls`. The file sets no route, custom domain, or DNS record. The church stays in memory and can reset at any time.

Live answers use the same Workers AI path as the local demo. Local runs and tests stay on the mock unless you opt in.

The deploy reads `AI_GATEWAY_BASE_URL`, `AI_GATEWAY_ACCOUNT_ID`, and `AI_GATEWAY_ID` from the shell. When one is unset or blank, `web/cloudflare.config.ts` keeps the dummy value, so a credential-free build still works. Do not edit that file, and do not commit the account id.

From `web`, set the account id. The first deploy of a new Worker must include `AI_GATEWAY_TOKEN`. `cf` rejects that deploy when the secret is absent. Build, then deploy the built output with a dotenv secrets file. The file contains `AI_GATEWAY_TOKEN=${READY_AI_GATEWAY_TOKEN}`. `cf` expands that reference from the environment. The token stays out of the file and out of shell history. This publish step is not part of CI.

```bash
cd web
export AI_GATEWAY_ACCOUNT_ID='paste-account-id-here'
export AI_GATEWAY_BASE_URL=https://gateway.ai.cloudflare.com/v1
export AI_GATEWAY_ID=ready-demo
read -s READY_AI_GATEWAY_TOKEN
export READY_AI_GATEWAY_TOKEN
printf '%s\n' 'AI_GATEWAY_TOKEN=${READY_AI_GATEWAY_TOKEN}' > .env.deploy
npm run build:vinext
npx cf deploy --prebuilt --mode production --secrets-file .env.deploy
rm .env.deploy
unset READY_AI_GATEWAY_TOKEN
```

The deploy command prints a `workers.dev` URL. Call that URL `DEMO_URL`. Confirm the command output has no preview URL.

A later deploy keeps the existing secret. From `web`, export the same three gateway values and run `npm run deploy:vinext`.

To replace the token, use the masked prompt. Do not pass `--text`. That flag stores the token in shell history. In a terminal, this command asks `Enter value for --text` and masks the input.

```bash
npx cf workers secrets update AI_GATEWAY_TOKEN --worker ready-demo --type secret_text
```

When stdin is not a terminal, the same command reads the token from stdin. `read -s` keeps it out of shell history.

```bash
read -s AI_GATEWAY_TOKEN
printf '%s' "$AI_GATEWAY_TOKEN" | npx cf workers secrets update AI_GATEWAY_TOKEN --worker ready-demo --type secret_text
unset AI_GATEWAY_TOKEN
```

```bash
curl -sI "$DEMO_URL/"
curl -sI "$DEMO_URL/robots.txt"
curl -sI "$DEMO_URL/v1/intake/profile"
curl -s "$DEMO_URL/robots.txt"
```

Each response includes `x-robots-tag: noindex`. The robots body is `User-agent: *` and `Disallow: /`. Request one `/_next/static/` URL named by the page HTML. That response is 200, has a stylesheet or script content type, and includes `x-robots-tag: noindex`. The page shows `Demo: fictional data only. Please don't enter real child information.`

On 2026-12-31, delete the Worker. Deleting the Worker deletes its secret.

```bash
cd web
npx cf workers delete ready-demo
```

Then revoke the gateway token in the Cloudflare dashboard.

## Access

Membership roles are `admin`, `parent`, and `volunteer`. `children.parent_user_id` is the parent of that child.

| Action | Who |
| --- | --- |
| Create a draft (`POST /v1/intake/profile`) | The child's parent |
| Read a draft | That child's parent, and organization admins |
| Approve a draft (`POST /v1/profiles/:id/approve`) | That child's parent |
| Read an approved profile | Any member of the organization, including volunteers |

Volunteers never see drafts. Another parent in the same organization does not see or approve this child's draft. The service role is not used by the Worker.

The sign-in migration, once applied, replaces that wide approved-profile select with the child's parent. Volunteers then read shared briefs. Nothing in this repo applies the migration.

## Role access

Leave `READY_SIGN_IN` unset. The demo worker and the intake routes stay as they are, and `/v1/access/` answers `404`.

Set `READY_SIGN_IN=on` to open those routes on a local engine process. The process reads `SUPABASE_URL` and `SUPABASE_ANON_KEY`. It checks the caller's bearer token with `GET /auth/v1/user`, then reads and writes memberships, children, briefs, invites, and medical grants with that same token so row-level security applies. It ignores Auth role claims. It does not read a service-role key.

Tests use a fake Auth response for that check. The schema and row-level-security policies live under `supabase/migrations`. No script applies them.

A parent reads only their own child and self-registers as a parent. A volunteer reads only a shared brief for their room and Sunday. Medical text lives in `medical_notes`, and a brief line cannot use the field `medical`. A leader reads that church's setup and lessons, and invites a volunteer or a leader. A requested role that does not match that path is refused.

## Move to team-owned accounts

1. Create the team Cloudflare account and an AI Gateway in that account. This repository does not create accounts or cloud resources.
2. Put the team gateway base URL, account id, gateway id, and gateway token in Worker secrets. For local runs, put them in `.dev.vars`.
3. Keep provider credentials in the gateway (bring-your-own key or unified billing). Do not add provider API keys to this repository.
4. Change the `INTAKE_PROFILE_*` vars in `wrangler.toml` if the team uses different providers or models.
5. Create the team Supabase project. Apply `supabase/migrations`. Load `supabase/seed.sql` only for a demo. The seed is fictional.
6. Put the Supabase URL, anon key, and JWT secret in Worker secrets. Replace the seed's user ids with that project's auth user ids before using the seed against a real project.
7. Search tracked files for account ids, gateway hosts, and keys. Placeholders belong only in `.dev.vars.example`.
8. Run the probe (`npm ci`, `npm run typecheck`, `npm test`) before any later stage that deploys. This stage does not deploy.
