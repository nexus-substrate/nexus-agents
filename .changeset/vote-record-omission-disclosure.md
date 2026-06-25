---
'nexus-agents': patch
---

Doc-accuracy: disclose the known omission-detection gap in the tamper-evident
vote-record / pr-review-record SETs (#4011). The module docstrings claimed
"omission is detected via sequence gaps" as a flat integrity property, but
sequence-gap detection only catches a hole in the `0..maxSeq` run — it does NOT
catch deletion of a fork PARTNER (a record sharing a sequence with a survivor),
because duplicate sequences are a benign concurrent-fork signal. `verifyVoteRecordSet`
/ `verifyPrReviewRecordSet` therefore return `ok` after such a deletion.

This is within the disclosed residual-trust boundary (records are author-typed
and unsigned; closing the gap requires per-record signing, #3927 item 4) and
grants a commit-access actor no new capability, so it is a doc-vs-reality
correction, not a fix to detection. The docstrings, the audit-hash-chain threat
model (recommendation 4), and a new characterization test now state the limit
explicitly. No runtime behavior changed.
