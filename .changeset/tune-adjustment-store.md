---
'nexus-agents': minor
---

feat(core): bounded, time-decaying TuneAdjustmentStore for the self-tuning loop (#3147)

Adds the provenance-tagged routing-adjustment channel the closed-loop Tune stage
needs — separate from the LinUCB real-outcome channel (per the P2 ratifying-vote
dissent). Hard safety bounds: demotion-only (≤1.0), floored (never below 0.5 —
a CLI is never zeroed out by tuning), capped per step (≤0.2), and time-decaying
linearly back to 1.0 over 30min so a transient blip auto-reverses. The
CompositeRouter read (apply the multiplier in TOPSIS scoring) and the TuneStage
write (enforce path) land in the immediately-following PRs.
