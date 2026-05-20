#!/usr/bin/env bash
# Consolidation end-to-end test (epic #2887, issue #2895).
#
# Verifies the directory contract from epic #2872 holds when nexus-agents
# runs against a fresh repo — the bug class that made #2872/#2887 necessary
# (sprawl at cwd, state landing in the wrong place, sandbox-fallback
# misfiring) is only observable against a real filesystem, not the
# vitest-mocked unit tests.
#
# Two modes, selected by $1:
#   normal   — homedir writable. Per-repo subdirs land in <repo>/.nexus-agents/,
#              cross-repo subdirs in $HOME/.nexus-agents/.
#   sandbox  — homedir unwritable (read-only mount). Cross-repo subdirs
#              fall back to <repo>/.nexus-agents/ per issue #2888.
#
# Run via docker-compose.consolidation-test.yml. Expects:
#   - the repo mounted read-only at /repo (dist already built by CI)
#   - a writable scratch dir at /scratch
#   - $HOME pointed at a per-mode mount
set -uo pipefail

MODE="${1:?usage: consolidation-test.sh <normal|sandbox>}"
REPO_SRC="${REPO_SRC:-/repo}"
SCRATCH="${SCRATCH:-/scratch}"
CLI="node ${REPO_SRC}/packages/nexus-agents/dist/cli.js"

pass=0
fail=0
check() {
  # check "<description>" "<test expression result: 0=pass>"
  if [ "$2" -eq 0 ]; then
    echo "  ✓ $1"
    pass=$((pass + 1))
  else
    echo "  ✗ FAIL: $1"
    fail=$((fail + 1))
  fi
}

echo "=== Consolidation test — mode: ${MODE} ==="
echo "  HOME=${HOME}"
echo "  CLI=${CLI}"
echo ""

# --- Clean slate ----------------------------------------------------------
# Docker named volumes persist between `compose run` invocations, so a
# prior run's state would poison the assertions. Wipe both roots. In
# sandbox mode $HOME is a read-only mount — the rm fails harmlessly there
# (nothing was written anyway).
rm -rf "${HOME}/.nexus-agents" 2>/dev/null || true

# --- Fresh scratch repo ---------------------------------------------------
# `findRepoRoot()` only needs the `.git` marker directory, not a real git
# repo — so we mkdir it directly. node:22-bookworm-slim ships without the
# git binary, and pulling it in just to run `git init` would be wasteful.
REPO="${SCRATCH}/proj"
rm -rf "${REPO}"
mkdir -p "${REPO}/.git"
cd "${REPO}" || exit 1

# --- Run setup (creates the data-dir structure) --------------------------
# Non-interactive; exit code is allowed to be non-zero (missing CLIs/keys
# in a bare container produce health-gate warnings). We assert on the
# filesystem regardless — directory creation happens before the gate.
NEXUS_GITIGNORE_AUTO=1 ${CLI} setup --non-interactive >/tmp/setup.log 2>&1 || true

echo "--- Assertions ---"

# --- Per-repo subdirs land in <repo>/.nexus-agents/ ----------------------
for sub in sessions audit checkpoints; do
  [ -d "${REPO}/.nexus-agents/${sub}" ]
  check "per-repo subdir ${sub}/ created under <repo>/.nexus-agents/" $?
done

# --- .gitignore carries the entry ----------------------------------------
grep -q '\.nexus-agents/' "${REPO}/.gitignore" 2>/dev/null
check ".nexus-agents/ present in <repo>/.gitignore" $?

# --- Anti-sprawl: no stray dirs at the repo root -------------------------
for stray in runs logs .nexus-pipeline; do
  [ ! -e "${REPO}/${stray}" ]
  check "no '${stray}' sprawl at repo root" $?
done

# --- Mode-specific: cross-repo routing -----------------------------------
if [ "${MODE}" = "normal" ]; then
  # Homedir writable → cross-repo subdirs live in $HOME/.nexus-agents/.
  [ -d "${HOME}/.nexus-agents/learning" ]
  check "cross-repo subdir learning/ in \$HOME/.nexus-agents/" $?
  [ -d "${HOME}/.nexus-agents/auth" ]
  check "cross-repo subdir auth/ in \$HOME/.nexus-agents/" $?
  # Per-repo subdirs must NOT have leaked into homedir.
  [ ! -d "${HOME}/.nexus-agents/sessions" ]
  check "per-repo subdir sessions/ did NOT leak into \$HOME" $?
else
  # Sandbox: homedir unwritable → cross-repo subdirs fall back per-repo (#2888).
  [ -d "${REPO}/.nexus-agents/learning" ]
  check "cross-repo subdir learning/ fell back to <repo>/.nexus-agents/" $?
  [ -d "${REPO}/.nexus-agents/research" ]
  check "cross-repo subdir research/ fell back to <repo>/.nexus-agents/" $?
fi

echo ""
echo "=== ${MODE}: ${pass} passed, ${fail} failed ==="
if [ "${fail}" -ne 0 ]; then
  echo "--- setup.log (last 30 lines) ---"
  tail -30 /tmp/setup.log
  exit 1
fi
exit 0
