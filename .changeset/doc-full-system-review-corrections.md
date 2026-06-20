---
'nexus-agents': patch
---

docs: full-system review corrections — accuracy, small-n honesty, and user-journey improvements

A documentation-only pass correcting verified accuracy drift, removing
exaggeration around small-n experiment results, and improving the new-user
journey. No code changed.

Accuracy: drop the wrong "12-stage" router count; fix plugin-install skill/agent
counts (33/12); mark REST API + Standalone CLI as roadmap; disclose the
`higher_order`/`opinion_wise` consensus alias (#514); refresh the audit
hash-chain threat model for the versioned (`hashVersion:2`) projection and the
landed "immutable" → "tamper-evident" correction; move authority-ladder #3841/#3842
into Implemented; bump ADR-0005 to Phase 2 Complete; caveat the dated software
factory report.

Honesty: qualify the v5 PR-review "100% bug-catch / conclusively validated"
claims as directional small-n (n=10, synthetic); reconcile the dataset size
(v5 run n=10, committed dataset now n=19, growing toward n≥50 per #3847).

Journey: add CLI-vs-MCP orientation and the `run` entry point to the
getting-started docs; document per-repo/shared `.nexus-agents` state paths;
clarify `NEXUS_AUTH_ENABLED` scope; relabel `NEXUS_ENFORCE_KEY_BOUNDARIES` as
planned/not-implemented (#3997).
