---
'nexus-agents': minor
---

Add a deterministic ClawGuard violation false-positive-rate + precision scorer over a hand-labeled starter corpus (#4104, epic #4094) — the measurement mechanism for the #2077 audit→enforce decision. The fixture rate is a proxy that validates the scorer; the live decision needs the persisted clawguard_violation events (from #4097) human-labeled. Measures precision of FIRED violations; recall is out of scope.
