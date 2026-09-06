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
#   3 — version mismatch or unknown install mode
#   4 — --help missing core commands
#   5 — doctor command failed
#   6 — MCP stdio handshake failed
#   7 — SQLite unusable after a scripts-blocked install (#5388)
#   8 — node:sqlite experimental warning leaked to users (#5392)
#   9 — ast-grep native grammars unusable / polyglot scanner found nothing (#5427)
set -euo pipefail

VERSION="${1:-latest}"
EXPECTED_VERSION="${EXPECTED_NEXUS_VERSION:-}"  # optional pin
INSTALL_MODE="${NEXUS_VERIFY_INSTALL_MODE:-ignore-scripts}"

step() { printf '\n========== %s ==========\n' "$*"; }
fail() { printf '❌ %s\n' "$*" >&2; exit "${2:-1}"; }
ok()   { printf '✅ %s\n' "$*"; }

read_installed_version() {
  local raw_version
  raw_version=$(nexus-agents --version 2>&1 | tr -d '\r' | tail -1 || true)
  INSTALLED_VERSION=$(printf '%s' "$raw_version" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || true)
  if [[ -z "$INSTALLED_VERSION" ]]; then
    fail "--version did not contain a semver after install: '$raw_version'" 3
  fi
}

resolve_requested_version() {
  local version_output
  if [[ -f "$VERSION" ]]; then
    if ! version_output=$(tar -xOf "$VERSION" package/package.json 2>&1); then
      printf '%s\n' "$version_output" >&2
      fail "could not read package.json from tarball: $VERSION" 3
    fi
    REQUESTED_VERSION=$(printf '%s' "$version_output" | node -e '
      let input = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk) => { input += chunk; });
      process.stdin.on("end", () => { process.stdout.write(JSON.parse(input).version); });
    ')
  elif [[ "$VERSION" == "latest" ]]; then
    if ! version_output=$(npm view nexus-agents version); then
      fail "could not resolve requested version: $INSTALL_SPEC" 3
    fi
    REQUESTED_VERSION="$version_output"
  else
    if ! version_output=$(npm view "$INSTALL_SPEC" version); then
      fail "could not resolve requested version: $INSTALL_SPEC" 3
    fi
    REQUESTED_VERSION=$(printf '%s' "$version_output" | tail -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
  fi
  if [[ -z "$REQUESTED_VERSION" ]]; then
    fail "requested package version did not contain a semver" 3
  fi
}

case "$INSTALL_MODE" in
  ignore-scripts | default | npm12 | update | pnpm) ;;
  *) fail "unknown install mode: $INSTALL_MODE" 3 ;;
esac

step "Phase 1: install nexus-agents@${VERSION}"
# Detect tarball path vs version spec. Tarballs install by file path directly;
# versions install via the registry as `nexus-agents@<version>`.
if [[ -f "$VERSION" ]]; then
  INSTALL_SPEC="$VERSION"
  printf 'Installing from local tarball: %s\n' "$INSTALL_SPEC"
else
  INSTALL_SPEC="nexus-agents@${VERSION}"
fi
case "$INSTALL_MODE" in
  ignore-scripts)
    # Defense in depth: --ignore-scripts blocks postinstall hooks from arbitrary
    # packages in the dep tree. We can't hash-pin `npm install -g <name>@<version>`
    # the way Scorecard suggests (hash-pinning via --require-hashes needs a lock
    # file; global installs are by-name), but --ignore-scripts mitigates the class
    # of threats the pin-check defends against.
    if ! npm install -g "$INSTALL_SPEC" --omit=optional --ignore-scripts 2>&1; then
      fail "npm install failed" 1
    fi
    ;;
  default)
    if ! npm install -g "$INSTALL_SPEC" 2>&1; then
      fail "npm install failed" 1
    fi
    ;;
  npm12)
    if ! npm install -g npm@12 2>&1; then
      fail "npm 12 install failed" 1
    fi
    hash -r
    NPM_VERSION=$(npm -v)
    if [[ "$NPM_VERSION" != 12.* ]]; then
      fail "npm 12 activation failed: npm -v reported $NPM_VERSION" 1
    fi
    if ! npm install -g "$INSTALL_SPEC" 2>&1; then
      fail "npm install failed under npm 12" 1
    fi
    ;;
  update)
    resolve_requested_version
    if ! npm install -g nexus-agents@8.6.0 2>&1; then
      fail "older nexus-agents install failed" 1
    fi
    read_installed_version
    if [[ "$INSTALLED_VERSION" != "8.6.0" ]]; then
      fail "older-version mismatch: expected 8.6.0, got $INSTALLED_VERSION" 3
    fi
    PREVIOUS_VERSION="$INSTALLED_VERSION"
    if ! npm install -g "$INSTALL_SPEC" 2>&1; then
      fail "npm update-in-place failed" 1
    fi
    read_installed_version
    if [[ "$INSTALLED_VERSION" == "$PREVIOUS_VERSION" ]]; then
      fail "update did not change version from $PREVIOUS_VERSION" 3
    fi
    if [[ "$INSTALLED_VERSION" != "$REQUESTED_VERSION" ]]; then
      fail "updated-version mismatch: expected $REQUESTED_VERSION, got $INSTALLED_VERSION" 3
    fi
    ;;
  pnpm)
    export PNPM_HOME="$HOME/.pnpm"
    export PATH="$PNPM_HOME:$PNPM_HOME/bin:$PATH"
    if ! corepack enable 2>&1; then
      fail "corepack enable failed" 1
    fi
    if ! corepack prepare pnpm@latest --activate 2>&1; then
      fail "pnpm activation failed" 1
    fi
    resolve_requested_version
    # KEBAB, not camelCase. pnpm 12 defaults `minimumReleaseAge` to 24h, so
    # `latest` resolves to the newest release OLDER than that — 8.19.1 while
    # latest was 8.31.0. `--config.minimumReleaseAge=0` is accepted and
    # silently ignored; `--config.minimum-release-age=0` is the form that
    # takes. Verified in a clean node:22-bookworm-slim container against
    # pnpm 12.3.4: camelCase installed 8.19.1, kebab installed 8.31.0.
    if ! pnpm add -g "$INSTALL_SPEC" --config.minimum-release-age=0 2>&1; then
      fail "pnpm global install failed" 1
    fi
    read_installed_version
    if [[ "$INSTALLED_VERSION" != "$REQUESTED_VERSION" ]]; then
      fail "pnpm-version mismatch: expected $REQUESTED_VERSION, got $INSTALLED_VERSION" 3
    fi
    if ! PNPM_PACKAGE_LIST=$(pnpm list -g --parseable nexus-agents 2>&1); then
      printf '%s\n' "$PNPM_PACKAGE_LIST" >&2
      fail "could not locate pnpm global package" 1
    fi
    PACKAGE_ROOT=$(printf '%s\n' "$PNPM_PACKAGE_LIST" | tail -1)
    if [[ "$PACKAGE_ROOT" != */node_modules/nexus-agents || ! -d "$PACKAGE_ROOT" ]]; then
      fail "pnpm global package path is invalid: $PACKAGE_ROOT" 1
    fi
    ;;
esac

if [[ "$INSTALL_MODE" != "pnpm" ]]; then
  PACKAGE_ROOT="$(npm root -g)/nexus-agents"
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
ok "INSTALL_MODE=$INSTALL_MODE: install ok ($ACTUAL_VERSION)"

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

step "Phase 7: SQLite is actually usable (#5388)"
# THE phase this file was missing. Install above already passes
# `--ignore-scripts`, which is exactly the condition that broke end users: with
# better-sqlite3 the native binding was never built, `npm install` still exited
# 0, and the CLI died at runtime with "Could not locate the bindings file".
#
# Phases 1-6 all passed in that state, because not one of them touches a
# SQLite-backed path — and Phase 5 explicitly tolerates a failing `doctor`. A
# gate that cannot observe the breakage it is meant to catch is not a gate.
#
# `doctor` reports SQLite availability explicitly, so assert the POSITIVE
# verdict rather than merely that doctor ran.
SQLITE_OUT=$(nexus-agents doctor 2>&1 || true)
if printf '%s' "$SQLITE_OUT" | grep -qiE 'SQLite[^\n]*Not available'; then
  printf '%s\n' "$SQLITE_OUT" | grep -iE 'SQLite' >&2
  fail "SQLite reported unavailable after an --ignore-scripts install (#5388)" 7
fi
if ! printf '%s' "$SQLITE_OUT" | grep -qiE 'SQLite'; then
  fail "doctor no longer reports SQLite availability — Phase 7 cannot fail, so it is not a check" 7
fi
ok "SQLite available without any install script"

step "Phase 8: no experimental-SQLite warning leaks to users (#5392)"
# `node:sqlite` is experimental on Node 22 and Node emits its warning at IMPORT
# time, not first use. The CLI filters that one warning — but #5388 shipped a
# filter that could never fire, because the bundler hoists a static
# `import ... from 'node:sqlite'` above the filter's installation.
#
# Every unit test of the filter passed while it was useless, since each one
# installed the filter and then raised a warning by hand. Only the built
# artifact shows the truth, so assert on the artifact.
WARN_OUT=$(nexus-agents doctor 2>&1 >/dev/null || true)
if printf '%s' "$WARN_OUT" | grep -q 'SQLite is an experimental feature'; then
  printf '%s\n' "$WARN_OUT" | head -5 >&2
  fail "node:sqlite ExperimentalWarning leaked to stderr — the CLI filter is not firing (#5392)" 8
fi
ok "no experimental-SQLite warning on stderr"

step "Phase 9: ast-grep native grammars still parse (#5427)"
# The OTHER native surface, and since #5388 removed better-sqlite3, the last
# one. @ast-grep/lang-{python,go} ship prebuilt tree-sitter `.so` grammars and
# declare a `postinstall`, so under the --ignore-scripts install above they are
# in exactly the position better-sqlite3 was in: nothing rebuilt them.
#
# Importing them is not evidence — their `libraryPath` is a lazy getter, so the
# import succeeds whether or not the `.so` exists. Parsing alone is not evidence
# either: tree-sitter is error-tolerant, so the Go grammar parses Python source
# without complaint and simply finds nothing. Both halves are why this asserts
# on named RULE IDS from a fixture rather than on an exit code.
GRAMMAR_FIXTURE=$(mktemp -d)
trap 'rm -rf "$GRAMMAR_FIXTURE"' EXIT
cat > "$GRAMMAR_FIXTURE/bad.py" <<'PYFIXTURE'
import os


def run(cmd):
    os.system("ls " + cmd)
    eval(cmd)
PYFIXTURE

# `nexus-agents verify` reports the grammars as a named check, so assert its
# POSITIVE verdict — the same shape as Phase 7, and the diagnostic a user gets.
GRAMMAR_VERIFY=$(nexus-agents verify 2>&1 || true)
if ! printf '%s' "$GRAMMAR_VERIFY" | grep -qi 'Native Grammars'; then
  printf '%s\n' "$GRAMMAR_VERIFY" >&2
  fail "verify no longer reports a Native Grammars check — Phase 9 cannot fail, so it is not a check" 9
fi
if printf '%s' "$GRAMMAR_VERIFY" | grep -i 'Native Grammars' | grep -qiE 'unavailable|unusable|failed'; then
  printf '%s\n' "$GRAMMAR_VERIFY" | grep -i 'Native Grammars' >&2
  fail "verify reports the ast-grep grammars unusable after an --ignore-scripts install (#5427)" 9
fi
ok "verify reports Native Grammars healthy"

# Then the real scanner end to end: dist/security/ast-rules YAML + dynamic
# grammar registration + the walk. Run from inside the fixture directory
# because collectAstQaFindings refuses a scope outside the cwd.
cat > "$GRAMMAR_FIXTURE/probe.mjs" <<PROBE
import { runAstQaRules } from '${PACKAGE_ROOT}/dist/index.js';
const findings = await runAstQaRules({ targetDir: process.cwd() });
console.log(findings.map((f) => f.ruleId).sort().join(','));
PROBE
SCAN_OUT=$(cd "$GRAMMAR_FIXTURE" && node probe.mjs 2>&1 || true)
for expected in dangerous-eval-python shell-injection-python; do
  if ! printf '%s' "$SCAN_OUT" | grep -q "$expected"; then
    printf 'scanner output: %s\n' "$SCAN_OUT" >&2
    fail "polyglot scanner did not report $expected — the Python grammar is not usable (#5427)" 9
  fi
done
ok "polyglot scanner returned both expected findings without any install script"

step "All smoke tests passed"
printf '✅ nexus-agents@%s installs and runs cleanly\n' "$ACTUAL_VERSION"
