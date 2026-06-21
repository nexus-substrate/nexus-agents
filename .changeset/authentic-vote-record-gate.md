---
'nexus-agents': minor
---

Re-anchor the authority-tier promotion gate to the authentic vote-record ledger (#3927 item 1)

The CI promotion gate (`scripts/check-authority-tier-drift.ts`) now resolves a tier-transition's `ratificationVoteRef` against the tamper-evident `governance/vote-records.jsonl` — verified as a set with `verifyVoteRecordSet` — instead of the hand-committable `governance/ratification-votes.yaml`. It fails **closed** on a tampered/malformed ledger (`vote-records-ledger-invalid`), on conflicting-decision subjects (`promotion-ratification-ambiguous`), and on the existing unresolved/not-approved reasons. The subject is bound via a new optional, self-hash-covered `ratifies` field on the vote record (schema 1.1 → 1.2); records without it re-verify unchanged (back-compat). The YAML resolution path is removed; the file is deprecated in place (its removal is tracked separately). The change is a no-op for current behaviour (both ledgers are empty / no promotions yet). Authored from a 7/7 `higher_order` design vote. Remains tamper-**evident**, not tamper-**proof** — cryptographic signing is tracked as #3927 item 4.
