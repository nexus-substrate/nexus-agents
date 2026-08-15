---
'nexus-agents': minor
---

Add capacity-aware routing exclusion (#4373, criterion 3 of #4351).

`CapacityFilterStage` classifies each routing candidate's adapter capacity and emits a normalized `capacity_exhausted` diagnostic. Under `enforceHardLimits: true` it removes exhausted candidates, and when every candidate is excluded the router fails closed with an error naming each excluded arm and why. **The shipped default is signal-only** — see below.

This restores — in the shape the router actually needs — the capacity semantics of the `WorkBalancer` removed in #4378. Only the predicate carried over; the queue did not.

**Unmeasured capacity never excludes.** `CapacityStatus.observed` (#4374) marks whether a reading is real: when false, every other field is a default rather than a measurement. The stage classifies each candidate as exhausted / healthy / **unmeasured** and only an observed reading can exclude. A missing adapter or a failed capacity probe is likewise unmeasured, never exhausted — it fails open on absent evidence. Unmeasured candidates are also not counted as healthy; they surface as a distinct `capacity:unmeasured-N` signal.

**Signal-only by default — it does not exclude anything unless you opt in.** The only capacity signal available today is not quota exhaustion: `CapacityTracker` sets `exhausted` from a rolling 60-second window against hardcoded per-minute estimates (claude 100k tokens / 50 requests, its own comment calls them "conservative estimates"), and it self-clears within the minute. Hard-excluding on that would let an ordinary burst — a 7-voter panel, a subagent fan-out — empty the candidate pool and fail routing closed for a condition that resolves itself. Pass `enforceHardLimits: true` if you have a signal you trust.

**This does NOT yet close #4351 criterion 3.** That bug was weekly _quota_ exhaustion, which a per-minute rate counter cannot detect. #4456 tracks adding a durable, provider-asserted quota signal; enforcement is held until then.

**Second limitation (#4455):** capacity is assessed per display slot, so a CLI arm and an `api:*` arm sharing a slot share a verdict. Not reachable under the default `plan` billing mode.

Wired to the existing `enableCapacityBalancing` config flag rather than a new one. That flag was declared for #807 and defaulted to `true` while promising "deprioritize exhausted CLIs", but no stage ever read it — it is now honest. Set it to `false` to disable the stage entirely.
