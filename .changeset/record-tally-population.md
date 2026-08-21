---
'nexus-agents': patch
---

Tally only approvers in the vote record's `optionTally` (#4472 follow-up).

Found by end-to-end validation, not by tests. A live 7-voter panel produced a record whose `optionTally` read `C:4, A:3` while the response's `optionOutcome` read `C:4, A:2`. The extra vote came from the **contrarian, who rejected the proposal but still named an option** — `tallySelectedOptions` counted every voter carrying a `selectedOption`, regardless of decision.

That made the record internally inconsistent in the exact way this epic exists to prevent:

- `optionTally` summed to 7 while `optionCoverage.selectedCount` said 6 — two fields in the same record describing different populations.
- The threshold is evaluated over **approvers**, so the recorded tally described a different population than the verdict it accompanied. A reader reconstructing the decision from the ledger would compute a different leading share than the gate did.

`tallySelectedOptions` now filters to approvers, matching both `coverageOf` and the gate's `tallyOptions`.

The pre-existing test asserted `[{A:2},{C:1}]` for a fixture whose third voter is `catfish(reject)` — it was encoding the defect. Corrected to `[{A:2}]`, plus a new test asserting the tally and coverage always describe the same population. Mutation-verified: removing the approver filter fails two tests.
