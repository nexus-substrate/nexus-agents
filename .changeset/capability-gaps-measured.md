---
'nexus-agents': patch
---

`TaskContract.capabilityGaps` now carries `gapsMeasured` (#5919). Every contract
built by `orchestrate` and `delegate_to_model` declared `allSatisfied: true`
from a detector that never ran — and `gaps: []` with an empty `available` is
byte-identical whether a detector found nothing or was never called. The new
required boolean is what tells them apart. Behaviour is otherwise unchanged;
wiring the real detector in is tracked separately.
