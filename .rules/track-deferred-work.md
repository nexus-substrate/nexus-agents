---
paths: ['**/*']
description: File a GitHub issue for any deferred work — memory notes, PR follow-up bullets, and TODOs are not tracking
---

# Track All Deferred Work in GitHub Issues

<!-- CANONICAL SOURCE: this file. CLAUDE.md links here. -->

Auto-loaded. Every piece of identified work — including work you're choosing to defer — needs a **GitHub issue**. Memory notes, PR descriptions, "follow-up" bullets in comments, TODOs in code — none of those are tracking. They get forgotten. If the work isn't in an issue, it won't get done.

## This applies to

- **Follow-ups identified during a merged PR** — every "deferred for later" bullet in a PR description needs a corresponding tracking issue before the PR merges (or immediately after).
- **Scope cuts during planning** — when a plan slims a feature down to a minimum viable shape, each cut item gets its own issue.
- **Discovered bugs you're choosing NOT to fix inline** — file even if you won't touch them today (per the Discovered Issues protocol in `.rules/discovered-issues.md`).
- **Migration / refactor work you've identified as worth doing** — file before deferring; document the trigger condition that should unblock it.
- **Cleanup work surfaced by audits** — vestigial code, dead exports, stale comments — file the cleanup issue, even if you're not going to delete it this turn.

## This does NOT apply to

- Findings that fail the 4-point Discovered Issues gate (drop them entirely).
- Speculative "what if we" thinking with no concrete trigger (YAGNI).
- Work the user explicitly told you to skip or reject.

## Format for deferred-work issues

- Title says what; body has a `## Context` paragraph naming why you identified it; `## Scope` says what would change; `## Why deferred` says the trigger or condition that would justify picking it up.
- Include links to the merged PR or epic that surfaced the work.
- Memory notes can mirror the issue (track the rationale), but the memory is supplementary — the issue is canonical.

## Why this rule exists

Epic #2540 shipped with 5 "deferred follow-ups" listed in a memory note. None had tracking issues. Three weeks later, only the operator's manual review caught them. Without GitHub issues, deferred work depends on humans remembering — that's not a system, that's hope.
