---
name: poteto-mode-sticky
description: Sticky wrapper for pstack poteto-mode. Opt-in: use as the Cursor Custom Mode (or invoke explicitly) when the user or PM wants poteto-mode, so poteto-mode is reloaded and followed on every turn, including follow-ups and fix rounds.
---

# poteto-mode-sticky

On EVERY turn, including follow-ups and fix rounds:

1. Load the pstack plugin skill `poteto-mode` fresh and follow it in full. Earlier skill text already in context is never a reason to skip reloading or following it.
2. Fix rounds still go to fresh subagents, per poteto-mode's "Fresh subagents by default".
3. Never skip delegation or review because someone is "waiting". Cloud sessions are headless; nobody is waiting.
4. Speed is always standard: never pass a model slug ending in -fast or containing fast, for any role or spawn, even if a pstack skill says to pick speed or names a -fast default; use the matching non-fast slug.

This file only wraps poteto-mode. Do not copy its body here; it stays sourced from the pstack plugin so updates flow.
