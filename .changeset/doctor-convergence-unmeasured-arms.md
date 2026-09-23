---
'nexus-agents': patch
---

`doctor --deep` routing convergence no longer reports an arm with no outcome rows as a 0% success rate. It now covers `api:*` arms (recorded under their own id since #6554) as well as the four CLI slots. An arm with no rows is reported as `unmeasured`, and the average success rate is taken over measured arms only. When no arm has rows, the average is `unmeasured` and the output says so, where it used to print 0.0%.

`RoutingConvergence` changes shape:

- `cliSuccessRates: Map<string, number>` is replaced by `armSuccessRates: Map<string, ArmSuccessRate>`, where each entry is either `{ status: 'measured', rate, sampleCount }` or `{ status: 'unmeasured' }`.
- `avgSuccessRate` is now `number | 'unmeasured'`.
- A new field, `measuredArmCount`, reports how many arms have rows.
- `converged` now requires every measured arm to clear the cold-start threshold, and is `false` when no arm is measured. Previously it required all four CLI slots, so a workspace that routes only through API arms could never report converged.
