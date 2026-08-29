---
'nexus-agents': patch
---

fix(governance): make the authority-tier ratification gate able to fire

The gate read `governance/authority-tier-transitions.jsonl` — a 0-byte file
whose only writer, `IAuditLogger.logTierTransition`, is called from nothing but
tests and a no-op stub. Empty file → no transitions → zero findings, always. So
the #3842/#3894/#3927 path that resolves a `ratificationVoteRef` against the
tamper-evident `vote-records.jsonl` could not emit a finding, and the only live
guard on a promotion was a non-empty-string test — the cosmetic check #3842
states it replaced. A manifest could be promoted to `enforce` citing a vote that
does not exist.

Authority tiers are not changed at runtime: they live in
`governance/loop-tiers.yaml` and change by commit, so the runtime event the
design waited for never occurs. The resolution machinery is now pointed at the
promotion-evidence ledger, which does exist and does carry `ratificationVote`.
The dead transitions file is removed.

Remedy chosen by a 7-voter panel: Option C, 5 of 5 approvers, audit record #80.
