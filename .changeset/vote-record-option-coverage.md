---
'nexus-agents': patch
---

vote record: keep option coverage when no approver's selection is parseable

`tallySelectedOptions` returns `undefined` when no approver carries a usable `selectedOption`, and `deriveOptionFields` nulled `optionCoverage` along with it — so the option fields vanished at exactly the coverage extreme they exist to record.

A panel that unanimously **approved** while every selection failed `matchDeclaredOption` persisted as `{"decision":"rejected","approvalPercentage":100}` with no option fields at all. A ledger reader saw a 7-0 approval filed as rejected with nothing explaining why, and an auditor filtering `optionTally !== undefined` to find multi-option votes skipped that record entirely — the case most worth reviewing was the one the filter could not see.

The root cause was that the record layer was never told options had been declared, so it inferred "were there options?" from "did anyone pick one?". `BuildVoteRecordInput` and `recordAuthenticVote` now take `declaredOptions` as a **required** field including its `undefined` case, so the compiler names every call site — which is how the CLI vote path turned out to have the same defect. An ordinary yes/no vote still emits neither field, keeping it on the pre-1.3 hash projection so historical records keep verifying.
