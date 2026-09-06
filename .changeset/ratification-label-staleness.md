---
'nexus-agents': patch
---

Two fail-open gaps on the governor path. (1) The `owner-ratified` label survived
new commits: `dismiss_stale_reviews` retires an approving review when a PR is
pushed to, but nothing retired a label, so a ratification granted while a PR
touched only docs stayed valid after a later commit added
`packages/nexus-agents/src/audit/`. The gate now compares the label's
application time to when GitHub first observed the head (the earliest workflow
run for that sha — server-assigned, so a backdated commit date cannot defeat it)
and refuses a label that predates it, and
reports `indeterminate` when either time cannot be established. (2)
`runGovernorReviewGate` destructured `{ records }` and discarded
`invalidLines`, so tampering that took a record out of schema removed the
evidence instead of failing the check; `ledgerIntegrityFailure` now fails it
closed, mirroring the vote-record gate.
