---
'nexus-agents': patch
---

stop a litellm outage reading as clean pricing

CI-only. The pricing-drift workflow had no failing path. `check-pricing-drift.ts`
exits 0 on every route and says so, so the exit code carried no signal — and
the workflow recovered its verdict by scraping `"N field"` out of the report
prose with a `|| echo "0"` fallback. A catalog fetch failure prints no report,
so it fell through to that fallback and rendered as zero drift. A provider
outage and correct pricing produced the same green weekly run.

The script now prints `PRICING_DRIFT_STATUS=clean|drift|skipped` and
`PRICING_DRIFT_COUNT=<n>` on every terminating path, including the top-level
error handler, and the workflow defaults the status to `skipped` rather than to
a measurement. `check-parameter-drift.ts` already had exactly this shape; this
is the same treatment applied to its sibling.

Two reporting gaps close with it: a skip now emits a loud `::warning::` instead
of passing silently, and drift of one to five fields — real drift that sat
below the issue threshold and said nothing at all — is now reported without
filing an issue.
