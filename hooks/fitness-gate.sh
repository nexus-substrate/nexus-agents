#!/usr/bin/env bash
# Fitness-gate hook (#1830) — refuse push/merge if fitness score < 90.
# Designed for Claude Code plugin PreToolUse hook. Fails open (exit 0) if the
# fitness script is unavailable so users without a local dev setup aren't blocked.
set -euo pipefail

THRESHOLD=90
SCRIPT="scripts/fitness-score.ts"

# Only run if we're inside the nexus-agents repo (plugin's own context)
if [[ ! -f "$SCRIPT" ]]; then
  exit 0
fi

if ! command -v npx >/dev/null 2>&1; then
  exit 0
fi

SCORE=$(npx tsx "$SCRIPT" --format=json 2>/dev/null | grep -oE '"overallScore":\s*[0-9]+' | grep -oE '[0-9]+' || echo "0")

if [[ "$SCORE" -lt "$THRESHOLD" ]]; then
  echo "::error::Fitness score $SCORE is below threshold $THRESHOLD. Refusing push/merge." >&2
  echo "Run: nexus-agents fitness-audit   # to see which dimension dropped." >&2
  exit 1
fi

echo "✅ Fitness $SCORE ≥ $THRESHOLD"
exit 0
