---
'nexus-agents': patch
---

`verifyPrReviewRecordSet` and `verifyVoteRecordSet` now report
`notVerified: 'empty'` when the set they were asked to verify was empty. Both
returned a bare `{ ok: true, recordCount: 0 }`, so a green integrity result could
not be distinguished from "verified 40 records and every hash held" — the shape
`verifyChain` already fixed with the same field name and value. The verdict is
unchanged (an empty ledger is absence, not tamper evidence); the governor-review
gate and the vote-record ratification resolver now say so in their output
instead of staying silent.
