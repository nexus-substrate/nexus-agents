---
'nexus-agents': patch
---

fix(orchestration): honour PuppeteerConfig.costPer1KTokens instead of a hardcoded rate (#5171)

`costPer1KTokens` was declared, defaulted and Zod-validated but never read. The
cost-budget termination gate (`puppeteer-termination.ts:48`) honoured
`maxCostBudget` while comparing it against a `totalCost` computed from a
hardcoded `0.00001` per token — so an operator got partial control with no
signal about which half took effect.

The constant is numerically identical to the `0.01`-per-1K default, which is why
the gap survived: nothing looked wrong at the default.

The rate now reaches all three sites that priced tokens in this subsystem —
`state-manager.ts` (which feeds the termination gate), and `computeStepReward`
and `buildPuppeteerResult` in `puppeteer-helpers.ts`. The orchestrator threads
its configured value into the state manager it constructs; an explicitly
injected state manager is still left alone.

The three inline `tokensUsed * 0.00001` expressions collapse into one
`tokensToCostUsd` helper beside the config field it backs. It is a
subsystem-local rate applied to a caller-supplied number, not a registry lookup,
so it deliberately does not add a twelfth entry to the token→USD inventory in
#5122 — it gives that consolidation one site to change instead of three.
