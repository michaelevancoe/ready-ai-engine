#!/usr/bin/env bash

exec </dev/null >/dev/null 2>&1

set -u

PSTACK_COPY_VERSION=3

tmp=""
cleanup() {
  if [[ -n "${tmp}" ]]; then
    rm -f -- "${tmp}"
  fi
}
trap cleanup EXIT

write_default_per_repo_rule() {
  cat <<'RULE_EOF'
---
description: Per-repository pstack model budget loader for multi-repo workers
alwaysApply: true
---
# Per-Repository pstack Budget Rule
- This worker serves multiple repositories. Never rely on a global or cross-repo `pstack-models.mdc`.
- Before choosing a model or spawning any `Task` subagent (`how`, `why`, `architect`, `arena`, `swarm`, `interrogate`, `reflect`, `poteto-agent`, or `generalPurpose`), call `read_file` on `.cursor/rules/pstack-models.mdc` inside your current target repository checkout (after syncing/checking out the target commit).
- Use that checkout's `.cursor/rules/pstack-models.mdc` `# budget:` header and per-role lines as the authoritative `/setup-pstack` configuration for this run.
- For `how explorer` and read-only exploration subagents, use the exact `how explorer` model slug from that checkout's `.cursor/rules/pstack-models.mdc` (multi-file "Complex" scope in `how` Step 1 is normal exploration, not a reason to raise the reasoning tier).
RULE_EOF
}

main() {
  if [[ -z "${HOME:-}" ]]; then
    return 0
  fi

  local root models_file repo_rule dest_dir legacy_dest dest_rule marker current
  root="$(cd "$(dirname "$0")/.." && pwd)" || return 0
  models_file="${root}/.cursor/rules/pstack-models.mdc"
  repo_rule="${root}/.cursor/rules/pstack-per-repo-budget.mdc"
  dest_dir="${HOME}/.cursor/rules"
  legacy_dest="${dest_dir}/pstack-models.mdc"
  dest_rule="${dest_dir}/pstack-per-repo-budget.mdc"
  marker="${dest_dir}/.pstack-models.copy-version"

  mkdir -p -- "${dest_dir}" || return 0

  if [[ -f "${legacy_dest}" || -L "${legacy_dest}" ]]; then
    rm -f -- "${legacy_dest}" || true
  fi

  if [[ -f "${models_file}" ]] && grep -q '^alwaysApply: true$' "${models_file}" 2>/dev/null; then
    tmp="$(mktemp "${root}/.cursor/rules/.pstack-models.mdc.XXXXXX")" || return 0
    sed 's/^alwaysApply: true$/alwaysApply: false/' "${models_file}" >"${tmp}" || return 0
    mv -f -- "${tmp}" "${models_file}" || return 0
    tmp=""
  fi

  tmp="$(mktemp "${dest_dir}/.pstack-per-repo-budget.mdc.XXXXXX")" || return 0
  if [[ -f "${repo_rule}" && -s "${repo_rule}" ]]; then
    cp -- "${repo_rule}" "${tmp}" || return 0
  else
    write_default_per_repo_rule >"${tmp}" || return 0
  fi

  if [[ -f "${dest_rule}" ]] && cmp -s -- "${tmp}" "${dest_rule}"; then
    rm -f -- "${tmp}"
    tmp=""
  else
    mv -f -- "${tmp}" "${dest_rule}" || return 0
    tmp=""
  fi

  current=""
  if [[ -f "${marker}" ]]; then
    IFS= read -r current <"${marker}" || true
  fi
  if [[ "${current}" == "${PSTACK_COPY_VERSION}" ]]; then
    return 0
  fi

  tmp="$(mktemp "${dest_dir}/.pstack-models.copy-version.XXXXXX")" || return 0
  printf '%s\n' "${PSTACK_COPY_VERSION}" >"${tmp}" || return 0
  mv -f -- "${tmp}" "${marker}" || return 0
  tmp=""
  return 0
}

main || true
exit 0
