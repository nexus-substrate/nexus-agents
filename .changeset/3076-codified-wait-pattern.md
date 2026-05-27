---
'nexus-agents': patch
---

**docs(rules):** codified CI-outage wait-pattern in `.rules/autonomous.md` (#3076 primitive #2).

Follow-up to PR #3078 (which shipped `ci_health_check` as #3076 primitive #1). This change codifies the behavior — when CI fires unexplained / cross-PR failures (status checks not queuing, `workflow_dispatch` HTTP 5xx, codeload 404), the agent should diagnose with `ci_health_check` BEFORE retriggering, and pivot to non-CI work during confirmed outages.

## Why

The failure mode this addresses: during the 2026-05-26 outage (#3070), my session spent 90+ min retriggering via close+reopen and empty-commit pushes before recognizing the outage was global — every retrigger was wasted cycles because webhook delivery itself was broken. The user's #3076 documented the same pattern on a parallel session.

## What the rule says

When CI exhibits outage symptoms:

1. **Diagnose first** — `ci_health_check` or manual status-page + recent-runs check.
2. **When `status === 'outage'`**: pause the PR (no retriggers), pivot to non-CI work (docs, design, local-test verification), file an outage tracking issue, schedule a 30-min wakeup.
3. **When status resolves to `healthy`**: push a `chore(ci): kick after recovery` commit and resume.
4. **CI outages are NOT a hard stop** — the autonomous directive's "keep working" clause covers "work elsewhere and come back."

## Closes

Partial close on #3076 — primitive #2 (codified wait-pattern) shipped. Primitives #3 (CI-down merge clause) and #4 (outage frequency telemetry) remain open.
