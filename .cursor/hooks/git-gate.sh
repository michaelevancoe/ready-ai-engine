#!/usr/bin/env bash
# Block git commit and git push when a gitleaks scan finds a secret.
set -u

root="$(cd "$(dirname "$0")/../.." && pwd)"
payload_file="$(mktemp)"
report_file="$(mktemp)"
cleanup() {
  rm -f "$payload_file" "$report_file"
}
trap cleanup EXIT

cat >"$payload_file"
bash "$root/.cursor/copy-pstack-rule.sh" </dev/null >/dev/null 2>&1 || true

export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v gitleaks >/dev/null 2>&1; then
  bash "$root/.cursor/install-gitleaks.sh" >/dev/null 2>&1 || true
fi

deny() {
  local message="$1"
  printf '%s\n' "$message" >&2
  HOOK_MESSAGE="$message" python3 - <<'PY'
import json
import os

message = os.environ["HOOK_MESSAGE"]
print(json.dumps({
    "permission": "deny",
    "user_message": message,
    "agent_message": message,
}))
PY
  exit 2
}

allow() {
  printf '%s\n' '{"permission":"allow"}'
  exit 0
}

if ! command -v gitleaks >/dev/null 2>&1; then
  printf '%s\n' "gitleaks not installed" >&2
  printf '%s\n' '{"permission":"deny","user_message":"gitleaks not installed","agent_message":"gitleaks not installed"}'
  exit 2
fi

if ! command -v python3 >/dev/null 2>&1; then
  printf '%s\n' "gitleaks scan failed." >&2
  printf '%s\n' '{"permission":"deny","user_message":"gitleaks scan failed.","agent_message":"gitleaks scan failed."}'
  exit 2
fi

command_text="$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("command",""))' <"$payload_file" 2>/dev/null || true)"
if [[ -z "$command_text" ]]; then
  deny "gitleaks gate could not read the shell command."
fi

config_args=()
if [[ -f "$root/.gitleaks.toml" ]]; then
  config_args=(--config "$root/.gitleaks.toml")
fi

run_scan() {
  set +e
  gitleaks git \
    --no-banner \
    --redact \
    --log-level error \
    --report-format json \
    --report-path "$report_file" \
    --exit-code 2 \
    ${config_args[@]+"${config_args[@]}"} \
    "$@" \
    >/dev/null 2>&1
  local status=$?
  set -e
  if [[ "$status" -eq 0 ]]; then
    return 0
  fi
  if [[ "$status" -eq 2 ]]; then
    deny "gitleaks found a secret. The value was redacted and the git command was blocked."
  fi
  deny "gitleaks scan failed."
}

cd "$root"
if printf '%s\n' "$command_text" | grep -Eq '(^|[[:space:]])git[[:space:]]+push([[:space:]]|$)'; then
  run_scan "$root"
elif printf '%s\n' "$command_text" | grep -Eq '(^|[[:space:]])git[[:space:]]+commit([[:space:]]|$)'; then
  run_scan --pre-commit --staged "$root"
  run_scan --pre-commit "$root"
else
  run_scan "$root"
fi

allow
