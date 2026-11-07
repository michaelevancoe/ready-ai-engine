#!/usr/bin/env bash
# Deny any Task/subagent spawn whose model slug contains "fast" (FO rule: speed is always standard).
# Handles preToolUse (tool_input.model) and subagentStart (subagent_model).
set -u
in=$(cat)
m=$(printf '%s' "$in" | jq -r '[.tool_input.model?, .subagent_model?] | map(select(type=="string")) | join(" ")' 2>/dev/null) || m=$in
if printf '%s' "$m" | grep -qi 'fast'; then
  msg="Blocked: model '$m' is a fast model. FO rule: speed is always standard. Retry with the matching non-fast slug (drop -fast)."
  jq -nc --arg m "$msg" '{permission:"deny",user_message:$m,agent_message:$m}'
  exit 0
fi
echo '{"permission":"allow"}'
