---
'nexus-agents': patch
---

fix(learning): validate usage-ledger lines instead of casting them

`parseFileLines` did `JSON.parse(line) as UsageEvent` — a cast, not a
validation — and no `UsageEventSchema` existed. Every sibling JSONL reader in
the repo validates (`AuditEventSchema`, `TaskOutcomeSchema`,
`PersistedMetaOutcomeSchema`, `ci-health-log`); this was the one that did not,
and it is the cost ledger.

`eventMatches` inspects only `timestamp` / `modelId` / `category`, so a corrupt
`usdCost` reached `rollupByModel`'s `reduce((s, e) => s + e.usdCost, 0)`. A
string concatenated, a missing value produced `NaN`, and neither threw — so
`nexus-agents usage` reported `NaN` or `"0" + "1.5"` spend, `costPerSuccessUsd`
divided garbage, and the cost-descending sort silently reordered because `NaN`
comparisons are false.

Optional fields stay optional deliberately: `category`, `errorCode`, `priced`
and `priceSource` all postdate the original format — `priced` is documented as
"Absent on lines written before this field existed" — so requiring them would
have discarded real spend history, which is worse than the corruption being
fixed. The schema is not `.strict()` for the same forward-compatibility reason.

Rejected lines are now counted and logged at `warn`. A ledger that silently
drops lines under-reports spend with no way for the operator to tell.
