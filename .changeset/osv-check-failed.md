---
'nexus-agents': patch
---

fix(pipeline): stop reporting a failed OSV check as a clean dependency scan

`runOsvCheck`'s outer `catch` returned `OSV_EMPTY`, whose `failedLookups` is
`0`. `buildScanSummary` prints "OSV not checked for N of M dependencies" only
when `failedLookups > 0`, so a whole-check failure — a manifest read error, or
`queryOsvBatch` throwing — fell through to **"none blocking"**.

That is the exact phrase #5018's own comment says the counter exists to prevent:
"an OSV outage used to land here as 'none blocking'. A lookup that errored
produced no vulnerabilities, which is not the same as finding none." #5018 fixed
the per-dependency half; the whole-check catch reset the counter that fix
depends on.

`OsvCheckResult` gains `checkFailed`, distinct from `failedLookups` (individual
lookups that errored) and from the two honest empties — OSV disabled, and a
manifest with no dependencies — which stay `false` so the new message does not
print on every opted-out run. The summary reports it ahead of the other arms,
and the log moves from `debug` to `warn`: debug is invisible at normal levels,
so an operator saw a clean security summary with no signal the check failed.

The gate verdict is unchanged — a failed OSV check discloses rather than blocks,
matching the precedent #5018 set for partial failures.
