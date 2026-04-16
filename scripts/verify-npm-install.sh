#!/usr/bin/env bash
# Verify a clean `npm install -g nexus-agents` produces a working CLI + MCP
# server. Designed to run inside Dockerfile.npm-verify but also works on bare
# metal. Each phase fails fast with a clear marker so CI logs are scannable.
#
# Usage:
#   scripts/verify-npm-install.sh                          # verify latest published
#   scripts/verify-npm-install.sh 2.29.0                   # pin to specific version
#   scripts/verify-npm-install.sh /path/to/package.tgz     # verify local tarball
#                                                          # (catches packaging bugs
#                                                          # before publish — see #1841)
#
# Exit codes:
#   0 — all smoke tests passed
#   1 — install failed
#   2 — binary not on PATH
#   3 — version mismatch
#   4 — --help missing core commands
#   5 — doctor command failed
#   6 — MCP stdio handshake failed
set -euo pipefail

VERSION="${1:-latest}"
EXPECTED_VERSION="${EXPECTED_NEXUS_VERSION:-}"  # optional pin

step() { printf '\n========== %s ==========\n' "$*"; }
fail() { printf '❌ %s\n' "$*" >&2; exit "${2:-1}"; }
ok()   { printf '✅ %s\n' "$*"; }

step "Phase 1: install nexus-agents@${VERSION}"
# Detect tarball path vs version spec. Tarballs install by file path directly;
# versions install via the registry as `nexus-agents@<version>`.
if [[ -f "$VERSION" ]]; then
  INSTALL_SPEC="$VERSION"
  printf 'Installing from local tarball: %s\n' "$INSTALL_SPEC"
else
  INSTALL_SPEC="nexus-agents@${VERSION}"
fi
# Defense in depth: --ignore-scripts blocks postinstall hooks from arbitrary
# packages in the dep tree. We can't hash-pin `npm install -g <name>@<version>`
# the way Scorecard suggests (hash-pinning via --require-hashes needs a lock
# file; global installs are by-name), but --ignore-scripts mitigates the class
# of threats the pin-check defends against.
if ! npm install -g "$INSTALL_SPEC" --omit=optional --ignore-scripts 2>&1; then
  fail "npm install failed" 1
fi
ok "installed"

step "Phase 2: binary on PATH"
if ! command -v nexus-agents >/dev/null 2>&1; then
  fail "nexus-agents binary not found on PATH (npm prefix: $(npm config get prefix))" 2
fi
ok "binary at $(command -v nexus-agents)"

step "Phase 3: --version reports a semver"
RAW_VERSION=$(nexus-agents --version 2>&1 | tr -d '\r' | tail -1)
ACTUAL_VERSION=$(printf '%s' "$RAW_VERSION" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
if [[ -z "$ACTUAL_VERSION" ]]; then
  fail "--version did not contain a semver: '$RAW_VERSION'" 3
fi
ok "version: $ACTUAL_VERSION (raw output: $RAW_VERSION)"
if [[ -n "$EXPECTED_VERSION" && "$ACTUAL_VERSION" != "$EXPECTED_VERSION"* ]]; then
  fail "version mismatch: expected $EXPECTED_VERSION, got $ACTUAL_VERSION" 3
fi

step "Phase 4: --help lists core commands"
HELP_OUT=$(nexus-agents --help 2>&1 || true)
for cmd in orchestrate vote workflow expert doctor; do
  if ! printf '%s' "$HELP_OUT" | grep -qiE "(^|[[:space:]])$cmd"; then
    fail "--help missing expected command: $cmd" 4
  fi
done
ok "all 5 core commands present in --help"

step "Phase 5: doctor command runs"
# `doctor` exits non-zero when CLIs aren't installed (expected in a bare
# container). Treat as success as long as it produced its summary line.
DOCTOR_OUT=$(nexus-agents doctor 2>&1 || true)
if ! printf '%s' "$DOCTOR_OUT" | grep -qE 'Summary:|MCP Server mode|Models available'; then
  printf '%s\n' "$DOCTOR_OUT" >&2
  fail "doctor did not produce expected output sections" 5
fi
ok "doctor ran (output length: ${#DOCTOR_OUT} chars)"

step "Phase 6: MCP stdio server starts + responds to tools/list"
HANDSHAKE=$(printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"verify-npm-install","version":"1.0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}')

# 10s budget for full handshake. nexus-agents stdio server should respond fast.
RESPONSE=$(printf '%s\n' "$HANDSHAKE" | timeout 10 nexus-agents --mode=server 2>/dev/null || true)
if ! printf '%s' "$RESPONSE" | grep -q '"orchestrate"'; then
  printf 'first 500 chars of response:\n%s\n' "$(printf '%s' "$RESPONSE" | head -c 500)" >&2
  fail "MCP server did not advertise the orchestrate tool in tools/list response" 6
fi
TOOL_COUNT=$(printf '%s' "$RESPONSE" | grep -oE '"name":"[a-z_]+"' | sort -u | wc -l)
ok "MCP server responded; advertised $TOOL_COUNT distinct tools (expected ≥ 25)"
if [[ "$TOOL_COUNT" -lt 25 ]]; then
  fail "MCP tool count below sanity floor of 25 (got $TOOL_COUNT)" 6
fi

step "All smoke tests passed"
printf '✅ nexus-agents@%s installs and runs cleanly\n' "$ACTUAL_VERSION"
