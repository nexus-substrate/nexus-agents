---
'nexus-agents': minor
---

`avgLatencyMs` divides by the interactions it actually timed. Both the swarm-level metric and the per-edge one summed `durationMs` over the timed edges and then divided by every edge, folding untimed interactions in as zero — one 100ms interaction beside one untimed interaction reported 50ms as a measurement. The server-wide producer records interactions with no duration at all, so this was the common case. `SwarmHealthMetrics` gains an optional `timedInteractions` so the coverage behind the mean is readable.
