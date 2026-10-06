---
'nexus-agents': minor
---

Add NEXUS_CONSENSUS_ENFORCE=off|audit|enforce for the run consensus strategy,
with audit as the default. All modes expose enforcement status and record the
final panel once. Enforce blocks rejection and retries no_quorum or an approval
that would fail with errored seats counted as reject exactly once before failing
closed. Recording failures also fail enforced runs, including asynchronous jobs.
Off reports the verdict as unmeasured; audit reports wouldBlock without blocking.
