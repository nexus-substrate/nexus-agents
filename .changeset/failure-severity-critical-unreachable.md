---
'nexus-agents': patch
---

`DetectedFailure.severity` can now be `critical`. The mapping was an object
keyed by number walked with `Object.entries`, and `1.0` stringifies to the key
`"1"` — a canonical array index, which ES property enumeration puts first. The
real order was `["1","0.3","0.5","0.7"]`, so at full confidence the loop
assigned `critical` and then overwrote it with `low`, `medium` and `high`.
`FailureSeverity` and its Zod enum both published `critical` as a reachable
state and nothing could reach it.
