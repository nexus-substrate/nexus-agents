#!/usr/bin/env bash
# Fitness-gate hook (#1830) — refuse push/merge if the fitness score is below
# the bar. Claude Code plugin PreToolUse hook on `git push|gh pr merge`.
#
# #5445: this used to call scripts/fitness-score.ts with --format=json, a flag
# that script never parsed. It printed a human-readable box, the grep for
# "overallScore" matched nothing, `|| echo "0"` supplied a score of 0, and the
# hook refused EVERY push with "Fitness score 0 is below threshold 90" while
# the real score was 100. A missing key was being taken as a measurement.
#
# It now runs the canonical scorer — the same one CI's fitness gate runs
# (`fitness-audit`, src/governance/fitness-score.ts) — which emits real JSON
# with a top-level `score`. And it distinguishes three states that the old
# version collapsed into one number:
#   - scorer unavailable (no built CLI)  → skip, exit 0, say so. Fails open on
#     purpose so users without a local build are not blocked (#1830).
#   - scorer ran but produced no score   → exit 1, say so. NOT a score of 0.
#   - score read                         → compare against THRESHOLD.
set -euo pipefail

# The bar is the fitness-gate action's default (#5142 item 7). Kept as a
# literal here because a hook cannot parse a YAML action file portably;
# scripts/fitness-threshold-single-source.test.ts pins the two together.
THRESHOLD=90

# Test seam: a command that prints the scorer's JSON. Defaults to the built
# CLI in this checkout, which is what CI's gate runs too.
CLI="${NEXUS_FITNESS_CLI:-packages/nexus-agents/dist/cli.js}"

# Only meaningful inside the nexus-agents repo, with a built CLI.
if [[ ! -f "$CLI" ]]; then
  echo "fitness-gate: no built CLI at $CLI — skipped (not a score)" >&2
  exit 0
fi
if ! command -v node >/dev/null 2>&1; then
  echo "fitness-gate: node not on PATH — skipped (not a score)" >&2
  exit 0
fi

OUTPUT=$(node "$CLI" fitness-audit --format=json 2>/dev/null || true)

# Parse with node, not grep: a grep miss is what fabricated the 0. An
# unreadable score is an error, never a number.
SCORE=$(printf '%s' "$OUTPUT" | node -e '
let s = ""; process.stdin.on("data", d => s += d).on("end", () => {
  try {
    const j = JSON.parse(s);
    if (typeof j.score === "number" && Number.isFinite(j.score)) { process.stdout.write(String(j.score)); process.exit(0); }
  } catch {}
  process.exit(3);
})' 2>/dev/null) || {
  echo "::error::fitness-gate: the scorer ran but no numeric \`score\` could be read from its output. Refusing rather than guessing." >&2
  echo "Run: node $CLI fitness-audit --format=json   # to see what it printed." >&2
  exit 1
}

if [[ "$SCORE" -lt "$THRESHOLD" ]]; then
  echo "::error::Fitness score $SCORE is below threshold $THRESHOLD. Refusing push/merge." >&2
  echo "Run: nexus-agents fitness-audit   # to see which dimension dropped." >&2
  exit 1
fi
echo "✅ Fitness $SCORE ≥ $THRESHOLD"
exit 0
