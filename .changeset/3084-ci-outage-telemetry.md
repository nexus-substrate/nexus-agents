---
'nexus-agents': minor
---

**feat(mcp):** CI-outage frequency telemetry — log + query primitive (#3084 / closes #3076 primitive #4).

The final primitive from #3076. Every `ci_health_check` call now appends one record to `<NEXUS_DATA_DIR>/ci-health/events.jsonl`, and `getCiOutageFrequency()` returns a rolling-N-day aggregate so callers (primarily `improvement_review`) can surface frequency-based signals.

## Surface

- **`appendCiHealthEvent({ status, signals, repo? })`** — best-effort write. Failures are logged but never thrown; the diagnostic surface (`ci_health_check`) must not block on telemetry. Wired into `ci_health_check` itself — no caller-side opt-in needed.
- **`getCiOutageFrequency(days = 30)`** — returns `{ events, outages, degraded, degradedRatio, windowDays, windowStart }`. `degradedRatio = (outages + degraded) / events`; both states are operator-relevant.
- **`pruneOlderThan(keepDays)`** — idempotent log compaction. Periodic-caller concern; not on every append.

## Record shape

```ts
{
  v: 1,
  ts: '<iso>',
  status: 'healthy' | 'degraded' | 'outage' | 'unknown',
  repo?: 'owner/name',
  signals: [{ source, status, evidence }, ...],
}
```

## Storage

Per-repo under `<NEXUS_DATA_DIR>/ci-health/` (`ci-health` added to `PER_REPO_SUBDIRS`). Outages reported via `ci_health_check({ repo })` are repo-correlated; a wedge on repo A's queue doesn't predict repo B's health, so cross-repo aggregation would be misleading.

## Tests (15 new cases in `ci-health-log.test.ts`)

- Append: line shape, ordering preserved, optional `repo` field round-trips.
- Query: empty log returns zeros; status discrimination; window exclusion (40-day-old events ignored from 30-day window); custom window; non-positive `days` throws.
- Prune: no-op when nothing old; correctly drops + reports counts.
- `eventFromCheck` adapter: optional repo handling, signal-field stripping.
- Integration: malformed JSON lines tolerated (skipped, not fatal) — pre-existing corruption shouldn't break new queries.

## What this is NOT (yet)

- **`improvement_review` integration** — surface a frequency-threshold signal. Recommended next iteration but separate concern (touches `improvement_review`'s threshold table); deferring to the follow-up.
- **Cross-session anonymized aggregation** — would need an opt-in upload surface; design discussion explicitly out of scope per #3084.
- **Auto-polling `ci_health_check`** — only writes happen on explicit caller invocation, by design. False-positive outage signals from network blips would pollute the telemetry.

## Closes

Closes #3084 (the scoped primitive #4 issue). #3076 is already closed.
