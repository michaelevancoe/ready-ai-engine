#!/usr/bin/env bash
# Warn when shell output contains a secret. This hook does not block.
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

warn() {
  printf '%s\n' "$1" >&2
  printf '%s\n' '{}'
  exit 0
}

if ! command -v gitleaks >/dev/null 2>&1; then
  warn "gitleaks not installed"
fi

config_args=()
if [[ -f "$root/.gitleaks.toml" ]]; then
  config_args=(--config "$root/.gitleaks.toml")
fi

set +e
gitleaks stdin \
  --no-banner \
  --redact \
  --log-level error \
  --report-format json \
  --report-path "$report_file" \
  --exit-code 2 \
  ${config_args[@]+"${config_args[@]}"} \
  <"$payload_file" \
  >/dev/null 2>&1
status=$?
set -e

if [[ "$status" -eq 0 ]]; then
  printf '%s\n' '{}'
  exit 0
fi

if [[ "$status" -eq 2 ]]; then
  warn "gitleaks warning: a possible secret was found in shell output and redacted."
fi

warn "gitleaks warning: the scan did not finish."
