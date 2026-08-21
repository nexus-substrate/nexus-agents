---
'nexus-agents': minor
---

`consensus_vote` gains an `options` input, and thresholds now measure WHICH option won (#4472, increment 2b).

Declare named alternatives and the threshold must **also** be cleared by the leading option:

```jsonc
{
  "proposal": "Rewrite the router or patch it?",
  "options": ["Rewrite", "Patch"],
  "strategy": "unanimous",
}
```

Before this, `unanimous` was the _easiest_ bar to clear on a multi-option proposal: every voter approves while each picks something different, so a 6-1 split recorded as 7-0, 100% (#4452). Now `unanimous` requires every approver to have chosen the **same** option, and `supermajority`/`majority` measure the leading option's share.

**Composition, not replacement.** The option gate is applied on top of the existing approve/reject verdict — both bars must be cleared, and the gate can only ever turn approved into rejected. This keeps rejections meaningful (the tally counts only approvers, so alone it would read "4 approve for X, 3 reject" as 4/4 unanimous), keeps the change monotone, and leaves `strategies.ts` untouched. **With no `options` declared, behaviour is byte-identical.**

An approving voter whose selection is absent or matches no declared option stays in the denominator and credits no option, so a degraded response can only _lower_ the leading share, never raise it — degradation is a denial, never an escalation. The accepted cost is false negatives: a genuinely unanimous panel with one unreadable response reads 6/7 and misses the unanimous bar. On the governor path that is the correct direction to fail.

**Coverage is reported, not just priced in.** The response carries `optionOutcome` (tally, leading share, and `approverCount`/`selectedCount`/`unattributedApprovals`), and the vote record carries `optionCoverage` at schema **1.4**. A share alone cannot distinguish dissent from absence: `4 pick X + 3 unreadable` reads 57% exactly like a real 4/3 split. Vote summaries now carry `selectedOption`.

The gate runs **before** the decision is stamped, so the audit record and the response agree — a veto visible only on the response would leave the record claiming an approval that did not happen.

Hash compatibility: `optionCoverage` folds in with the same append-when-present rule as `optionTally` and `ratifies`, so every historical record re-hashes byte-identical and still verifies.
