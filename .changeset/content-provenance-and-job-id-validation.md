---
'nexus-agents': patch
---

Provenance labelling and input validation hardening.

- `run_dev_pipeline`: the consensus→execute policy gate now receives the tier of the content that fed the run, not only the caller's tier. When the research stage runs (or research is resumed from a checkpoint), the content tier is Tier 3 (external); a run that supplies its own research text keeps the caller's tier. Under `NEXUS_POLICY_GATE_MODE=block`, a Tier 1 caller whose run reads fresh research is now blocked at that gate.
- `memory_write`: credentials in `key` and `content` are redacted before storage. Entries record a trust tier when one is known — the caller's measured tier, or the new optional `sourceTrustTier` input for content from an external source, whichever is less trusted.
- Context prompt prefixes (`NEXUS_CONTEXT_RETRIEVER_INJECT`): memory lines with a recorded tier are labelled `[tier N]`, and entries recorded at Tier 3 or 4 are left out. `summarizeContextForPrompt` accepts `{ allowUntrustedMemory: true }` to include them. Entries without a recorded tier render as before.
- `get_job_result` and `cancel_job` reject a `jobId` outside the server-minted format (letters, digits, `_`, `-`; 1–128 characters). The job-result path builders apply the same check.
