---
'nexus-agents': patch
---

fix(audit): refuse to write the tracked vote ledger from a test run (#6070)

`persistVoteRecord` now throws under a test runner when its destination is the
source checkout's own tracked `governance/vote-records.jsonl`, and the file is
left untouched. The pr-review ledger has refused the same write since #4415;
the vote ledger did not, and its `NEXUS_VOTE_RECORDS_PATH` override honours an
absolute path as-is, so any test (or a developer shell) that pointed the
override at the checkout's ledger appended a record that self-hashes cleanly.
The authority-tier promotion gate reads that file as its ratification evidence,
so a fabricated line there could promote a loop's authority tier. Only
`git status` would have noticed.

The guard is lifted out of the pr-review store into a shared
`audit/source-checkout-guard` module (`isUnderTestRunner`,
`assertNotSourceCheckoutWrite`), parameterised on the tracked path and the
per-ledger env var, and both stores call it before their `try` so the refusal
cannot be swallowed as a warn-and-return-undefined write failure. The pr-review
store's behaviour and refusal message are unchanged. The comparison is equality
of resolved paths, not a prefix test: a sibling such as `<ledger>.bak` still
writes. Outside a test runner the guard is inert, and writes to any other
absolute path — including the runtime ledger under `.nexus-agents/` — are
unaffected.
