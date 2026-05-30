---
'nexus-agents': patch
---

**fix(ci-health):** bound telemetry log growth + surface corrupted lines (#3089).

The CI-health event log (`ci-health-log.ts`, shipped in #3084) had two reliability gaps that this fixes:

- **Unbounded growth.** `appendCiHealthEvent` runs on every `ci_health_check`, and `getCiOutageFrequency` reads the whole file each call — so an autonomous polling loop grew the log (and every read) without limit. `pruneOlderThan` existed but was never wired, and being age-based it can't bound a burst of _recent_ events anyway. Appends now opportunistically cap the file to the most recent lines that fit within `NEXUS_CI_HEALTH_MAX_BYTES` (default 2 MiB), gated by a cheap `statSync` so the O(n) rewrite only runs when the cap is actually exceeded. Best-effort — telemetry never blocks or throws.
- **Silent corruption.** `readAllEvents` dropped unparseable lines with no signal, so a partial write or tampered line made aggregates under-count invisibly. It now logs a `warn` with the skipped-line count.
