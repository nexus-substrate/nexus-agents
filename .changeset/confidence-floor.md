---
'nexus-agents': patch
---

Let task-classification confidence report "no evidence" (#4677)

`classifyTask` floored its own confidence at 1/3 with
`Math.max(...Object.values(scores), 1)` — a guard against a `0/3` division that
was never harmful. The low-confidence enrichment gate is `< 0.2`, so the gate
could never open: `tryIssueTriage` and the LLM classification refinement
(#1779/#1798) were unreachable from the day they were written.

Measured over 20 realistic goals and 10 pathological inputs including the empty
string: minimum confidence was **0.3333** in every case.

The floor also masked something worse than a dead branch. A task matching no
keywords was reported at 0.33 confidence in a pipeline type it had been
_defaulted_ into — absence rendered as a real measurement.

Removing the floor makes the gate reachable for ~60% of realistic goals, each of
which would otherwise fall through to an LLM call. That is a new behaviour with
a per-task cost, not a restoration, so LLM refinement is now behind
`NEXUS_LLM_CLASSIFICATION=1` (default off). Issue-triage enrichment, which is
local and only fires on GitHub issue URLs, stays enabled.
