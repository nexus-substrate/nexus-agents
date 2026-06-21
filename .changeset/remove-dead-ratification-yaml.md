---
'nexus-agents': patch
---

Remove the dead ratification-votes.yaml ledger + its test-only schemas (#4010)

#4005 re-anchored the authority-tier promotion gate to the authentic, tamper-evident `governance/vote-records.jsonl` and removed the YAML resolution path. This deletes the now-orphaned `governance/ratification-votes.yaml` (zero live code reads) and the test-only `RatificationVoteSchema` / `RatificationVoteLedgerSchema` (+ types) from `audit/audit-types.ts`, drops the corresponding `tier-transition-audit.test.ts` block, and updates the `codepr-guards` governance-path example to the live `vote-records.jsonl`. Pure dead-code removal; the authentic record-set verification (`verifyVoteRecordSet`) and the gate are unchanged.
