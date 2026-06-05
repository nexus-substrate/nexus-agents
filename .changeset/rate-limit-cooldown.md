---
'nexus-agents': patch
---

Rate-limit cooldown for the opencode/OpenRouter path (#3408, epic #3403 follow-up). When an opencode call returns `RATE_LIMITED` (the OpenRouter free-tier 429s), the model is marked in the AvailabilityCache cooldown so subsequent selections skip it until the TTL recovers — and the opencode adapter's `--model` resolution now treats a cooled model as unusable, resolving to the closest non-cooled live alternative (or falling back to the CLI default). Completes the two-sided wiring: the cooldown _consumer_ already existed (delegate-to-model filtered `isKnownUnavailable`); this adds the _producer_ (mark on 429) + the opencode consumer. Opt-in via `NEXUS_DYNAMIC_MODELS`, fail-open (off → no cooldown, identical prior behavior), and advisory (a cooled model is still usable via an explicit available `--model`). Scoped to the opencode adapter where the 429s actually occur — the shared base adapter is untouched.
