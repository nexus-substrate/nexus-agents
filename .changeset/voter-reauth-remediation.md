---
'nexus-agents': patch
---

When a consensus voter fails because a CLI's stored OAuth token is stale (e.g. codex's "your refresh token was already used. Please log out and sign in again"), the voter's error now includes an actionable remediation — ``Re-authenticate: run `codex login` …`` — instead of surfacing the raw provider error as a silent fail-closed vote (#3350). Extends the existing `cli-error-envelope` auth classifier to recognize the refresh-token-rotation error class and reuses its per-CLI login-hint map; vote semantics are unchanged (still an error/abstain vote, just with a clearer message).
