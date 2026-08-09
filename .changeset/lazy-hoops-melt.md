---
'nexus-agents': patch
---

fix(cli-adapters): stop reporting unobserved capacity as full capacity (#4374)

`CapacityStatus` had no way to say "I do not know". A tracker that had never
recorded a single request returned `remainingTokens: tokenLimit`,
`utilizationPercent: 0`, `exhausted: false` — byte-identical to a genuinely idle,
healthy adapter — and `doctor` rendered that as a green `100% remaining`. For a CLI
whose weekly quota was consumed by another process that reading is fiction, and it
is what made the #4351 reproduction confusing: the panel advertised healthy capacity
while every voter came back empty.

`CapacityStatus` now carries `observed`. It is sticky — pruning the usage window
back to empty does not clear it, because the process has still seen the adapter
work. `doctor` renders an unobserved reading as `unknown (no usage observed this
session)` rather than inventing health; an observed idle adapter still reports
`100% remaining` as before. The API-backed `ModelToCliAdapter` reports
`observed: false`, since its infinite values are a stand-in for "no rate window to
report", not a measurement.

The docs on the field state the narrower guarantee that holds even when `observed`
is true: the tracker sees only this process's spend and has no visibility into a
provider-side quota consumed elsewhere, so `remainingTokens` is a local upper bound,
never an authoritative one.

Also removes `DEFAULT_CAPACITY_FALLBACK`, dead since #2714 removed its only call
site and never re-exported from any package entry point.
