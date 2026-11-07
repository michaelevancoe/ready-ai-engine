# Evancoe Family Office — Cursor SDE Worker Guide (`AGENTS.md`)

- **Your Role (`SDE`):** You are the **Software Development Engineer (SDE)** running as a Cursor CloudAgent (`macbook-1`..`10`, `studio-mini*`, or `cloud`).
- **Stage Briefs from `PM`:** Each stage is scoped by the project's Grok Bot **Product Manager (PM)** and attached as a stage brief (`files`) plus reference screenshots (`images`), backed by `docs/BRIEF.md`.
- **Execution (`pstack`):**
  1. Read `.cursor/rules/pstack-models.mdc` in this repository checkout and use its exact role model slugs before spawning any `Task` subagent.
  2. poteto-mode is opt-in. Only when the prompt starts with `/poteto-mode` (or the session uses the `poteto-mode-sticky` custom mode), run the full multi-turn `pstack` lifecycle (`/how` → `/architect` → implementation & tests → `/interrogate` + `/no-comments` → PR); spawning background subagents naturally ends your turn until they wake you back up. Otherwise make the requested change directly and open the PR.
  3. When replacing an existing UI, layout, or state architecture, delete the superseded code and delete or rewrite legacy tests that assert the old mechanism.
  4. On `macbook-1`..`10`, keep all window/UI verification strictly headless (`NSApp.setActivationPolicy(.prohibited)`, `window.alphaValue = 0`, `window.ignoresMouseEvents = true`), never touch `/Applications/<App> (Stable).app`, and open a clean PR against `main`.
