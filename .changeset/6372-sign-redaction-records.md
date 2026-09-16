---
'nexus-agents': minor
---

Redaction records in the committed vote ledger can now carry the same SSH `signature` envelope as ratification records, outside their hash (#6372). `verifyVoteRecordSignature` and `signVoteRecordHash` accept either record kind — the window is anchored at `recordedAt` for a vote record and `at` for a redaction — and the new `record-signature-schema` module holds the shared envelope. `scripts/redact-vote-record.ts` signs by default with the same key resolution and owner/agent attestation rules as `append-ratification-record.ts`, and the governor ledger gate reports a redaction's signature beside its target. Also corrects the `PrReviewBindingBoundsSchema` doc comments to describe the raw-bytes measurement in place since #6177 (#6226).
