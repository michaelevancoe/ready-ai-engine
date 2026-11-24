# Ready AI Engine — Product Brief

- **Product:** Ready AI Engine (backend for Ready)
- **Slug:** `ready-ai-engine` (`projects/ready-ai-engine/brief.md`)
- **Owner PM Bot:** `memeteam.ai` (`f2108134-e5ab-4526-a125-9ecfb5160b28`)
- **Repository:** `michaelevancoe/ready-ai-engine` (existing, private, README-only at `8b49853`; kept and regularized, not recreated — Michael 2026-11-07)
- **Exposure Class:** `private` (undeployed). `public-edge` is a possible future class only. It needs a separate `FO, CTO` approval ([PROCEDURE.md §2](../../PROCEDURE.md#2-roles--approvals)) and a CSO pass.
- **Size:** `M`
- **Approval:** `FO, CTO` approved this brief and Stage 1 on 2026-11-07 (America/Phoenix). Michael authorized the correct setup and a restart after the PM loop-in at 2026-11-07 11:46 MST. That authorization is not approval of the cancelled run `bc-0855ff66`. That run stays cancelled and is not resumed.
- **Route:** No `Michael-selected Cursor Project:` designation. Stage work uses the direct cloud launch ([PROCEDURE.md §3](../../PROCEDURE.md#user-selected-cursor-project-route)).
- **Provenance:** Product concept from `/workspace/ready/ready-ai-build-plan.md` (Michael's answers incorporated). Hackathon context from [`projects/church-hackathon/brief.md`](../church-hackathon/brief.md). This project is linked from that brief's Stage 2 row.

---

## 1. Purpose & Audience
Ready is Michael's AI for Church 2026 hackathon entry (church-hackathon brief). The engine is the backend between the Ready app and AI models. A parent's intake answers become a parent-approved child profile, and later a volunteer brief, a Sunday social story, and a post-Sunday parent update (build plan). Success: every AI output is a draft that a person approves before anyone else sees it, and no real child data exists anywhere.

## 2. Architecture & Separation of Concerns
- Only the engine (a Cloudflare Worker) calls models, always through Cloudflare AI Gateway. The provider and model per endpoint are configuration (build plan, Decisions 1 and 4).
- Supabase holds data, sign-in, and row-level security, scoped by organization and role (build plan, Decision 5).
- Core logic stays UI-free and testable without network or cloud accounts.
- **Portability:** a later move to team-owned accounts is config and docs only (Michael t79u–t80u).

## 3. Non-Goals & Hard Limits
- **Out of scope:** real child or family data, real payments or charges, deploys, creating cloud resources or accounts, provisioning secrets, and church or ministry connectors. The frontend is limited to a minimal local demo in `web/` (Stage 3). Design polish, auth UI, and deployment of the frontend come in later stages, each needing its own approval. Connecting Michael's real AI Gateway or Supabase accounts needs his separate approval, routed through `FO, CTO`. Approved 2026-11-13 (Michael t95u, `FO, CTO`): the local demo may call Workers AI through the `ready-demo` AI Gateway on Michael's Cloudflare account, with fictional seed data only, mock as the default, and a narrowly scoped token kept only in a gitignored `.dev.vars`. No third-party provider keys. Supabase, deploys, published Workers and anything public-facing still need a new proposal. Approved 2026-11-13 (Michael t97u, `FO, CTO` Stage 5): one demo Worker on an unlisted `*.workers.dev` link with no sign-in (Michael's choice, t98u), noindex, fictional in-memory data only, preview URLs off, no custom domain, DNS or routes, and teardown on 2026-12-31 unless Michael extends it.
- **Data:** made-up seed data only (build plan, Decision 7). No PII in model calls beyond need, and none in logs.
- **Secrets:** never committed.
- **Public-Surface Privacy Rule:** the factory policy is unchanged ([PROCEDURE.md §2](../../PROCEDURE.md#2-roles--approvals)). Any public surface shows only `Michael Evancoe`, `github.com/michaelevancoe`, and `evancoe.com`.

## 4. Stages Overview
| Stage | Card | Summary & Exit Criteria |
| --- | --- | --- |
| Stage 1 | [`stages/stage-1.md`](stages/stage-1.md) | **Onboarding prerequisite** (not a product stage): factory bootstrap and `docs/BRIEF.md` on `main` through one onboarding-only Cursor SDE pull request. CI gitleaks green. No application code. |
| Stage 2 | [`stages/stage-2.md`](stages/stage-2.md) | Thin slice: model helper with fallback, intake to profile, Supabase migrations and row-level security, fake seed, mocked tests, portability README. Pull request only. No deploy. |
| Stage 3 | [`stages/stage-3.md`](stages/stage-3.md) | Minimal local demo frontend in `web/` (Next.js App Router, React, Radix): enter intake for a fictional child, see the draft profile, approve it. Mock model and fictional seed only. Local only. No deploy, auth UI, or design polish. Approved by `FO, CTO` 2026-11-13. |
| Stage 4 | [`stages/stage-4.md`](stages/stage-4.md) | Live model option for the local demo: an env-gated switch sends the fictional intake to Workers AI through the `ready-demo` AI Gateway. Mock stays the default, and tests stay off the network. No Supabase, deploy or published Worker. Approved by `FO, CTO` 2026-11-13. |
| Stage 5 | [`stages/stage-5.md`](stages/stage-5.md) | Shareable demo: the local demo deployed as one unlisted `*.workers.dev` Worker for Michael and Edens, with live Workers AI through `ready-demo`. Teardown on 2026-12-31. Approved by `FO, CTO` 2026-11-13. |
