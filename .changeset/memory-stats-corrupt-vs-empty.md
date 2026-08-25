---
'nexus-agents': patch
---

let memory_stats tell a broken backend from an empty one

Every registry-attached `count()` collapsed a failed Result into `0`, so
`StatsOnlyAdapter.stats()` never rejected, `collectRegistryStats`'s catch never
fired, and `memory_stats` returned `{count: 0, error: null}` for a corrupt or
locked SQLite backend — byte-identical to a healthy empty store.
`RegistryDomainStats.error`, documented as "Error message when the backend's
stats() rejected", described a state nothing could produce.

`extractCount` now throws on an explicit `{ok: false}` Result and the four
call sites hand the Result through unchanged, so the catch that was already
written and correct can populate `error`. An unrecognised shape still yields
`0` — that is genuinely unknown rather than a reported failure.

Verified from #4827.
