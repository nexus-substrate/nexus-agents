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
- **Dependency-blocked / sequenced work — the most-forgotten case.** Anything deferred _because it depends on another deliverable_ ("do after X lands", "increment B once A merges", "wait until the entry point feeds real data"). File it **the moment you name it, not when the blocker clears** — deferring the _filing_ until the dependency is done is precisely how the work gets dropped. Record the blocking dependency + unblock trigger in the body and link it (`blocked by #N`). A multi-step epic is only tracked if **every** step has its own issue — a prose "Phase 3 / increment B will…" in the epic body is a description, not a tracked task.

## When a blocker clears, surface its dependents

Tracking only prevents loss if something _reads_ the tracker. When you complete or merge a deliverable, search for work blocked on it (`gh issue list --search "#<id>"`, or walk the epic's children) and pick up or re-prioritize whatever the completion just unblocked. A finished dependency should surface its dependents; don't rely on remembering them.

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
