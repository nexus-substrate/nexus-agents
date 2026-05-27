---
'nexus-agents': minor
---

**feat(mcp):** `ci_health_check` MCP tool — agent-readable signal for CI infrastructure outages (#3076).

Read-only diagnostic for "is CI working right now?" Composes two signals an autonomous agent would otherwise have to derive by grepping failed-CI logs:

1. **GitHub status page** (`https://www.githubstatus.com/api/v2/components.json`) — reports per-component health. The `GitHub Actions` component flips to `degraded_performance` / `partial_outage` / `major_outage` during the kind of incident #3076 describes.
2. **Recent-runs activity window** — query the configured repo's `actions/runs` endpoint over a short window (default 30 min, configurable 5-180). When the status page says "operational" but no runs have completed for the repo in that window despite known recent pushes, the local queue is wedged (exactly the failure mode hit on 2026-05-26 — global status was operational but our org's queue was dead for >90 min, per #3070).

## Surface

```ts
ci_health_check({
  repo?: 'owner/name',           // optional — composes the repo-activity signal
  activityWindowMinutes?: 30,    // 5-180, default 30
}) => {
  status: 'healthy' | 'degraded' | 'outage' | 'unknown',
  checkedAt: '<iso>',
  signals: [
    { source: 'github-status', status, evidence: 'GitHub Actions component reports: operational' },
    { source: 'repo-activity-window', status, evidence: '14 workflow run(s) in last 30 min on ...' },
  ],
}
```

## Combined verdict — pessimistic

If the status page reports outage, return outage. If the status page is healthy but the local repo has been silent for the activity window, return degraded (operator can still act, but with the warning). Unknown signals are ignored unless every signal is unknown.

## Annotations

- `readOnlyHint: true` — no state mutated
- `idempotentHint: true` — same inputs return the same shape
- `openWorldHint: true` — outbound network to githubstatus.com + GitHub API (already accessed by other tools)

## Tests

18 cases in `ci-health-check-tool.test.ts`:

- Schema: required-form validation (`owner/repo`), bounds on activity window, optional fields.
- Per-signal: status-page operational/degraded/outage/missing-component/fetch-fail.
- Combined: pessimistic combination (healthy status + wedged repo → degraded), all-healthy → healthy, runs-outside-window ignored.
- Edge: unknown when only the repo signal fails; ISO timestamp shape; validation error envelope for malformed repo.

## What this is NOT

- **Not a workaround for outages.** It's a _signal_ for the agent to stop wedging on auto-merge waits during an outage, NOT a substitute for CI. When `outage` returns, the right behavior is "pause this PR, work elsewhere, retrigger in 30 min" — exactly the #3076-proposed pattern.
- **Not telemetry.** Single-shot diagnostic — does not persist to the outcome store. Telemetry primitive (#3076 ask #4) is separate work, not included here.

## Closes

Partial close on #3076 — primitive #1 (`ci_health_check`) shipped. Primitives #2 (codified wait-don't-retrigger pattern), #3 (CI-down merge clause), #4 (outage frequency telemetry) remain open as follow-ups.
