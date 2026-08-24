---
'nexus-agents': patch
---

fix(mcp): stop recording a constant trust tier as if it were a measurement

`createRequestContext` falls back to `caller = {}`, and `deriveTrustTier({})`
returns `'3'`. Nothing in the tree supplies `callerInfo` — its only references
are the declaration and one forward — so every recorded tier was that fallback.
The stage-entry telemetry added in #4699 therefore recorded `'3'` on every run,
which reads as a measurement and is not one.

`measuredTrustTier` returns the tier only when it was actually derived from
caller information, so consumers record `unmeasured` instead of a constant. When
a real `callerInfo` producer lands it starts returning values with no further
change.

This does not make the tier vary — that needs the producer. It stops the record
claiming otherwise. Also documents at the helper that this is caller
AUTHENTICATION, not content provenance: a trusted client can submit hostile
content, and `classifyTrust` (the closest provenance signal) requires a GitHub
actor and does not apply to a bare goal string.
