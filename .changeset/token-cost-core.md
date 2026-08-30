---
'nexus-agents': patch
---

feat(learning): one canonical token→USD core, with cache components named (#5122)

Increment 1 of the ratified consolidation (epic #5121; shape C won 6/6 on the
option). An audit found **eleven** implementations of this arithmetic — the issue
said eight — disagreeing by **3.3x on identical usage**: 1M input + 1M output on
`claude-sonnet` gave $18.00 from six paths, $20.00 from three, $6.00 from one.
They also disagreed on rounding, returning `0.000003` and `0.0000025` off the
same rate.

Adds `learning/token-cost-core.ts`: a pure, rate-injectable core. No registry
lookup (so caller-supplied-rate paths can share it), no rounding (the usage log's
micro-USD rounding is a ledger requirement, not a property of cost), and no
unpriced policy — those stay in named wrappers, because the panel found a policy
_enum_ would make picking the wrong one a one-character mistake that typechecks
and ships green, which is how #4165/#4196 happened.

The signature takes cache reads and writes from day one, on the dissenting
voter's binding condition: consolidating onto an input/output-only shape would
guarantee a second sweeping refactor. A component with tokens but no rate is
named in `unpricedComponents` rather than silently costing zero, so a cache-heavy
call reports a floor honestly instead of presenting a partial as a total (#5170).

`computeCostDetail` becomes the registry-backed, ledger-rounded wrapper over it.
Behaviour is unchanged, verified by shadow comparison across six model/token
cases before and after.

No call sites move in this increment. Remaining forks: 10.
