#!/usr/bin/env bash
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

respond() {
  local decision="$1"
  local message="$2"
  if ! command -v python3 >/dev/null 2>&1; then
    if grep -q '"beforeSubmitPrompt"' "$payload_file" 2>/dev/null; then
      if [[ "$decision" == "allow" ]]; then printf '%s\n' '{"continue": true}'; else printf '{"continue": false, "user_message": "%s"}\n' "$message"; fi
    elif [[ "$decision" == "allow" ]]; then
      printf '%s\n' '{"permission":"allow"}'
    else
      printf '{"permission":"deny","user_message":"%s","agent_message":"%s"}\n' "$message" "$message"
    fi
    return
  fi
  HOOK_DECISION="$decision" HOOK_MESSAGE="$message" HOOK_PAYLOAD="$payload_file" python3 - <<'PY'
import json
import os

decision = os.environ["HOOK_DECISION"]
message = os.environ["HOOK_MESSAGE"]
event = ""
try:
    with open(os.environ["HOOK_PAYLOAD"], encoding="utf-8") as handle:
        event = json.load(handle).get("hook_event_name", "")
except Exception:
    event = ""

if event == "beforeSubmitPrompt":
    if decision == "allow":
        print(json.dumps({"continue": True}))
    else:
        print(json.dumps({"continue": False, "user_message": message}))
elif decision == "allow":
    print(json.dumps({"permission": "allow"}))
else:
    print(json.dumps({
        "permission": "deny",
        "user_message": message,
        "agent_message": message,
    }))
PY
}

deny() {
  local message="$1"
  printf '%s\n' "$message" >&2
  respond deny "$message"
  exit 2
}

if python3 - "$payload_file" "${HOME:-}" <<'PY'
import json
import os
import sys

payload_path, home = sys.argv[1], sys.argv[2]

def raw_path_ok(path):
    if not isinstance(path, str) or "\x00" in path or not path.startswith("/"):
        return False
    parts = path.split("/")
    return bool(parts) and all(part not in ("", ".", "..") for part in parts[1:])

def root_kind(prefix):
    if prefix in ([".cursor", "skills"], [".cursor", "skills-cursor"]):
        return "tree"
    if prefix == [".cursor", "rules"]:
        return "rule"
    if (
        len(prefix) >= 3
        and prefix[0] == ".cursor"
        and prefix[-1] == "skills"
        and "plugins" in prefix[1:-1]
    ):
        return "tree"
    return None

def rule_name(name):
    return name.endswith(".mdc") and not name.startswith(".")

def relative_parts(anchor, path):
    anchor_abs = os.path.abspath(anchor)
    if path == anchor_abs:
        return None
    if path.startswith(anchor_abs + os.sep):
        return path[len(anchor_abs) + 1 :].split(os.sep)
    anchor_real = os.path.realpath(anchor)
    if path.startswith(anchor_real + os.sep):
        return path[len(anchor_real) + 1 :].split(os.sep)
    return None

def exempt_under(anchor, path):
    if not raw_path_ok(anchor) or not raw_path_ok(path):
        return False
    parts = relative_parts(anchor, path)
    if not parts:
        return False
    anchor_real = os.path.realpath(anchor)
    if anchor_real == os.sep or not os.path.isdir(anchor_real):
        return False
    current = anchor_real
    root_real = None
    kind = None
    for index, part in enumerate(parts):
        if part in ("", ".", ".."):
            return False
        lexical = os.path.join(current, part)
        if os.path.islink(lexical):
            if root_real is None:
                return False
            target = os.path.realpath(lexical)
            try:
                if os.path.commonpath([root_real, target]) != root_real:
                    return False
            except ValueError:
                return False
            current = target
            continue
        if not os.path.lexists(lexical):
            return False
        current = lexical
        if root_real is None:
            found = root_kind(parts[: index + 1])
            if found:
                if not os.path.isdir(current):
                    return False
                root_real = os.path.realpath(current)
                kind = found
    if root_real is None or kind is None:
        return False
    final = os.path.realpath(current)
    try:
        if final == root_real or os.path.commonpath([root_real, final]) != root_real:
            return False
    except ValueError:
        return False
    if not os.path.isfile(final):
        return False
    if kind == "rule":
        return len(parts) == 3 and rule_name(parts[2])
    return True

try:
    with open(payload_path, encoding="utf-8") as handle:
        payload = json.load(handle)
except Exception:
    sys.exit(1)

if payload.get("hook_event_name") != "beforeReadFile":
    sys.exit(1)

file_path = payload.get("file_path")
if not raw_path_ok(file_path):
    sys.exit(1)
file_path = os.path.abspath(file_path)

anchors = []
if raw_path_ok(home):
    anchors.append(home)
roots = payload.get("workspace_roots")
if isinstance(roots, list):
    anchors.extend(root for root in roots if raw_path_ok(root))

if any(exempt_under(anchor, file_path) for anchor in anchors):
    sys.exit(0)

# Any SKILL.md inside a skills* tree that Cursor installs under ~/.cursor,
# ~/.agents or /opt (cloud VMs and plugin caches put skills in varied places).
import re
real = os.path.realpath(file_path)
skill_anchors = ["/opt"]
if raw_path_ok(home):
    skill_anchors += [os.path.join(home, ".cursor"), os.path.join(home, ".agents")]
for anchor in skill_anchors:
    for base in {os.path.abspath(anchor), os.path.realpath(anchor)}:
        if base == os.sep or not os.path.isdir(base):
            continue
        pat = "^" + re.escape(base) + r"/(?:[^/]+/)*skills[^/]*/(?:[^/]+/)*SKILL\.md$"
        if re.match(pat, file_path) and re.match(pat, real) and os.path.isfile(real):
            sys.exit(0)
sys.exit(1)
PY
then
  respond allow ""
  exit 0
fi

export PATH="$HOME/.local/bin:$root/.cursor/.bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v gitleaks >/dev/null 2>&1; then
  if command -v timeout >/dev/null 2>&1; then
    timeout 60 bash "$root/.cursor/install-gitleaks.sh" >/dev/null 2>&1 || true
  else
    bash "$root/.cursor/install-gitleaks.sh" >/dev/null 2>&1 || true
  fi
  hash -r
fi

if ! command -v gitleaks >/dev/null 2>&1; then
  # Reads must never break for lack of the scanner. Prompts and MCP calls
  # stay fail-closed.
  if grep -q '"beforeReadFile"' "$payload_file" 2>/dev/null; then
    printf '%s\n' "warning: gitleaks unavailable after install attempt; allowing read unscanned" >&2
    respond allow ""
    exit 0
  fi
  deny "gitleaks not installed"
fi

if ! command -v python3 >/dev/null 2>&1; then
  deny "gitleaks scan failed."
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
  respond allow ""
  exit 0
fi

if [[ "$status" -eq 2 ]]; then
  deny "gitleaks found a secret. The value was redacted and the action was blocked."
fi

deny "gitleaks scan failed."
