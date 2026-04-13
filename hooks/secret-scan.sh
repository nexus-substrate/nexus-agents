#!/usr/bin/env bash
# Secret-scan hook (#1830) — warn on credential patterns in sensitive files.
# Fires via PreToolUse matcher on Write/Edit of .env, credentials.json, *.yaml.
# Does not block — prints warning and lets the tool proceed.
set -euo pipefail

FILE="${1:-}"
if [[ -z "$FILE" || ! -f "$FILE" ]]; then
  exit 0
fi

# Pattern set mirrors gitleaks defaults for common credential shapes.
PATTERNS=(
  'sk-[A-Za-z0-9]{30,}'                    # OpenAI / Anthropic / generic sk- keys
  'AKIA[0-9A-Z]{16}'                        # AWS access key ID
  'ghp_[A-Za-z0-9]{36}'                     # GitHub PAT
  'gho_[A-Za-z0-9]{36}'                     # GitHub OAuth
  'AIzaSy[A-Za-z0-9_-]{33}'                 # Google API key
  '-----BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY-----'  # Private keys
)

for pat in "${PATTERNS[@]}"; do
  if grep -qE "$pat" "$FILE" 2>/dev/null; then
    # Skip obviously-fake test fixtures per .claude/rules/test-secrets.md
    if grep -qE 'TEST|FAKE|EXAMPLE|NOT_REAL' "$FILE"; then
      continue
    fi
    echo "::warning::Possible credential pattern detected in $FILE (pattern: $pat)" >&2
    echo "If this is a real secret, use .env (gitignored) or a secrets manager." >&2
  fi
done

exit 0
