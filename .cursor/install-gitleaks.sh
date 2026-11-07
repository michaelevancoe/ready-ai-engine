#!/usr/bin/env bash
# Install the gitleaks version pinned by .cursor/environment.json.
# No sudo: installs to $HOME/.local/bin, or .cursor/.bin in the repo if HOME is not writable.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="$HOME/.local/bin:$root/.cursor/.bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

version="${GITLEAKS_VERSION:-8.30.1}"
if [[ "$(uname -s)" != "Linux" ]]; then
  printf 'gitleaks auto-install supports Linux only; install it with Homebrew on macOS\n' >&2
  exit 1
fi
case "$(uname -m)" in
  x86_64)
    asset="gitleaks_${version}_linux_x64.tar.gz"
    checksum="${GITLEAKS_SHA256_LINUX_X64:-551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb}"
    ;;
  aarch64 | arm64)
    asset="gitleaks_${version}_linux_arm64.tar.gz"
    checksum="${GITLEAKS_SHA256_LINUX_ARM64:-e4a487ee7ccd7d3a7f7ec08657610aa3606637dab924210b3aee62570fb4b080}"
    ;;
  *)
    printf 'unsupported architecture: %s\n' "$(uname -m)" >&2
    exit 1
    ;;
esac

if command -v gitleaks >/dev/null 2>&1 && [[ "$(gitleaks version 2>/dev/null || true)" == "$version" ]]; then
  exit 0
fi

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT
archive="$tmpdir/gitleaks.tar.gz"
url="https://github.com/gitleaks/gitleaks/releases/download/v${version}/${asset}"

curl -fsSL --connect-timeout 10 --max-time 45 -o "$archive" "$url"
echo "${checksum}  ${archive}" | sha256sum -c -
tar -xzf "$archive" -C "$tmpdir" gitleaks
if ! { mkdir -p "$HOME/.local/bin" && install -m 0755 "$tmpdir/gitleaks" "$HOME/.local/bin/gitleaks"; } 2>/dev/null; then
  mkdir -p "$root/.cursor/.bin" && install -m 0755 "$tmpdir/gitleaks" "$root/.cursor/.bin/gitleaks"
  printf '*\n' >"$root/.cursor/.bin/.gitignore"
fi
gitleaks version
