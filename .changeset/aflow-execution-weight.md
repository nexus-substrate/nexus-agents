---
'nexus-agents': patch
---

refactor(aflow): rename the dimensionless cost score to say what it measures (#5198)

`estimateCost` summed a step count, a retry count and a duration in milliseconds
against arbitrary weights, returned the result as a `number`, and fed a field
called `estimatedCost`. Nothing in it is a rate and no token is involved — the
value has no unit at all.

The old name made it indistinguishable at a call site from the token→USD paths
consolidated under #5122. Comparing it against a budget or a `maxCostUsd` would
be meaningless and the type system could not object, since both are `number`.
That is the shape of #5186, where a ceiling was compared against a figure
computed at the wrong rate — except here the figure has no rate at all.

Renamed within aflow: `estimateCost` → `estimateExecutionWeight`,
`estimatedCost` → `executionWeight`, `COST_MODEL` → `EXECUTION_WEIGHTS` (and its
fields `baseCostPerStep`/`costPerRetry`/`costPerTimeoutMs` →
`perStep`/`perRetry`/`perTimeoutMs`). Each site now documents that the value is
dimensionless.

Internal only — verified nothing here is on the public surface. The
`estimatedCostUsd` entries in `api-surface.txt` belong to the pipeline
`TaskContract`, a different symbol that this change does not touch.

The last item of #5122's original acceptance criteria; no behaviour change.
