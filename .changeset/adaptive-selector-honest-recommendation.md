---
'nexus-agents': minor
---

stop AdaptiveProtocolSelector reporting a decision it cannot make

`selectProtocol` returned `wasOverridden ? explicitPattern : selectedPattern`.
The false branch is reached only when the two are equal, so the returned
pattern was always `config.pattern` — the classification was computed and
discarded. `CollaborationPattern` has no `auto` member, so a caller has no way
to defer to adaptation.

`getRecommendation`, documented as a "preview of what protocol would be
selected", returned that same value: the caller's own input, with reasoning
attached that read as an answer.

- `SelectionResult` gains `adaptivePattern` — what adaptation would choose.
  `pattern` is unchanged and now documented as always being the caller's.
- `getRecommendation` returns the adaptive choice, so a recommendation is a
  recommendation.
- The log line was `'Protocol selection'` carrying `wasOverridden`, which read
  as a live choice that had been reversed. It is now
  `'Protocol classification (advisory)'` with the pattern in use named
  separately from the adaptive one.
- `TechLeadCollaboration.executeCollaboration` — the real consumer — passed
  `recommendedPattern` into `execute`. That was a no-op while the
  recommendation echoed the config. It now explicitly passes `config.pattern`,
  so behaviour is unchanged: making the recommendation real must not silently
  activate adaptive selection in production, where nothing measures it.

Whether that consumer should act on the recommendation is #4833.

Fixes #4833 (the misreporting).
