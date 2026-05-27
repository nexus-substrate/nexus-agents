---
paths: ['**/*']
description: Backlog priority, tie-break protocol, hard-stop conditions when running in /loop or autonomous mode
---

# Autonomous Operation Rules

<!-- CANONICAL SOURCE: this file is the canonical body. CLAUDE.md keeps a summary that points here. -->

Auto-loaded when the user gives a standing directive like "run autonomously", "keep working", "work on the backlog", "multi-day OK", or invokes `/loop`. These rules override the default "pause at clean handoff points to check in" behavior.

## Never pause to ask "what's next" while the backlog is non-empty

Finishing a task is not a stop condition. A clean commit, a merged PR, a closed issue — none of those end the session. Pick the next item from the backlog and keep going. If you catch yourself about to write "ready to pick up the next cycle or pause here" or "your call on priority" while there are open issues or actionable alerts, that's the failure mode. Proceed instead.

**Size is not a stop condition.** A multi-day epic, a 10-PR refactor, a backlog with 30 open items — none of those are reasons to check in or scale down ambition. Plan the order, ship the first piece, keep going. "I approve all work, don't stop due to size" means exactly that — propose a sensible order and execute it; do not ask whether the next piece is in scope.

**Cut releases as the work accumulates, don't batch.** When changesets land on `main` and an open "Version Packages" PR exists, merge it the same session — do not let it sit. Stale version PRs cause the publish-race incidents documented in `docs/ops/release-changeset-race.md`. Releases are part of "completing" work, not separate.

**Claude credit quotas are not a stop condition.** The autonomous directive explicitly covers credit consumption; agent time spent inside the directive's scope is authorized. Do not throttle, batch, or "save for later" on the basis of credit cost when the user has given a standing autonomous directive. The hard-stop list below is exhaustive — credit budget is not on it.

## Order of consideration (work the backlog top-down)

1. **CI red or security alerts** — failing workflows on main, CodeQL criticals, Scorecard regressions, dependabot advisories
2. **Open epics** — pick one with an open child; if all children are gated, check if the epic itself can close
3. **Open bugs labeled `bug` or with a clear RCA comment** — highest-leverage fixes
4. **Open PRs** — your own (complete CI → merge), dependabot (review → merge or close), auto-created (triage)
5. **CodeQL / Scorecard findings** — high / critical first
6. **Stale issues** — older than 90 days with no activity: verify, update, or close
7. **Research queued** — topics filed as `research:` issues
8. **Brainstorming** — file new issues for: drift observed during other work, TODO comments older than X, known-broken patterns in the code, vestigial modules, missing tests on critical paths

At every step, file issues for tangential findings rather than sidetracking. "See something, say something" — `.rules/discovered-issues.md` covers the mechanics.

## Tie-break via `consensus_vote`, not user ask

If genuinely unsure which of two or three backlog items to pick, run `consensus_vote` with `quickMode: true, strategy: simple_majority`. The vote result **is** the decision. Do not route ambiguity back to the user as "what do you want me to work on" — the user's autonomous directive already resolved that: whatever the vote picks.

## CI infrastructure outages — wait, don't retrigger (#3076)

When CI fires unexplained / cross-PR failures (codeload 404, status checks not queuing, `workflow_dispatch` HTTP 5xx, `gh pr view ... --json statusCheckRollup` returns empty despite recent push events), **do not retrigger via close+reopen / empty commits / `gh workflow run`** until you've checked health. Retriggering during an infrastructure outage burns cycles for no signal — the failure mode I (and #3076) hit was 90+ min of silent retries before recognizing the outage.

### Diagnose first

Run [`ci_health_check`](../packages/nexus-agents/src/mcp/tools/ci-health-check-tool.ts) (shipped in PR #3078) with the repo:

```ts
ci_health_check({ repo: 'owner/repo', activityWindowMinutes: 30 });
```

Or manually:

1. Fetch https://www.githubstatus.com/api/v2/components.json — check the `GitHub Actions` component's `status`. `degraded_performance` / `partial_outage` / `major_outage` means stop.
2. `gh run list --workflow=ci.yml --limit 10 --json status,createdAt` — if zero runs in the last 30 min despite recent push events, the local queue is wedged.

### When `status === 'outage'`

- Pause the affected PR — do not push more commits, do not retrigger, do not close+reopen.
- Pivot to non-CI work: docs, planning, design discussion, local-test verification of already-shipped code.
- File an outage tracking issue (template: `ops: GitHub Actions ... <date>`) so the next agent session has a breadcrumb.
- Schedule a wakeup ~30 min out. GitHub status-page incidents typically resolve in tens of minutes.
- When the wakeup fires and `ci_health_check` returns `healthy`, push an empty `chore(ci): kick after recovery` commit to re-trigger the missed workflow events.

### When `status === 'degraded'` (status page healthy + repo wedge)

- Same playbook: don't retrigger; pivot; recheck.
- If the wedge persists past one wakeup cycle, file an issue against the specific workflow (the repo may have a local config problem the status-page can't see).

### What does NOT change

The hard-stop list below is exhaustive — CI outages are not a hard stop. They're a "work elsewhere and come back" condition, fully covered by the autonomous directive's "keep working" clause.

## Admin-merge during CI outages (#3076 primitive #3)

`gh pr merge --admin` bypasses the "required CI checks" branch protection. It is the established pattern for this repo's owner work (most squash-merges on `main` were admin-merges by `@williamzujkowski`; PR #3064 is a representative example). During CI infrastructure outages, the agent may admin-merge a PR ONLY when **every** clause holds:

1. **`ci_health_check` returned `'outage'` or `'degraded'`** at PR creation OR the workflow runs cannot complete despite manual retriggers, AND the agent has verified the failure is global / cross-PR (not local to this PR's code).
2. **Local quality gates green** on the PR's branch — `pnpm typecheck`, `pnpm lint`, `pnpm test` (or the affected-subset), `pnpm governance:check` if governance touched.
3. **Change is mechanical or well-tested** — bug fix with regression test, version-bump, dep-bump with no API change, docs-only, generated-artifact regen. Multi-PR refactors or new features without test coverage do NOT qualify.
4. **An outage tracking issue exists** that links the PR (so the bypass has an audit breadcrumb).
5. **PR was waiting in CI for >30 min** with no progress, OR the wait would cross a release boundary (don't let a release PR sit during the freeze the outage created).

If ANY clause fails, wait it out — auto-merge with the existing required-CI gate is still the default.

When admin-merging, **state the bypass reason** in the merge commit body and add a comment on the outage issue noting which PR was admin-merged and why. The audit chain matters more than the convenience.

## Hard stop conditions (only these)

Genuinely pause and surface to the user ONLY when:

- **Cost-gated work** that needs prior approval not already granted (e.g. running a $100+ benchmark sweep)
- **Destructive operations** where the blast radius exceeds what the user authorized (force-push to main, delete data, revoke access)
- **Waiting on external system** with no path to progress (e.g. a dependency PR is stuck in another org's review, and there's no other autonomous work left)
- **CI failure requiring a human design decision** (not a mechanical fix)
- **Repeated failures** — same error 3+ times with distinct fix attempts, genuinely stuck

For everything else: keep working, summarize progress at end of turn, begin the next item.

## End-of-turn protocol for autonomous mode

Close each turn with a short status block:

```
Done this turn: <1-line summary of what shipped>
Up next: <the specific item being started, with issue/PR #>
```

No question marks at the end of turns. No "let me know if you want me to continue." The autonomous directive already authorized continuation.
