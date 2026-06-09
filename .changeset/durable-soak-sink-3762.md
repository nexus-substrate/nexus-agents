---
'nexus-agents': minor
---

feat(capability-loop): durably persist auto-remediation AUDIT-mode soak data (#3762)

Audit-mode auto-remediation now writes durable, queryable evidence instead of
only `logger.info`. Adds a shared append-only JSONL store primitive
(`config/jsonl-store.ts`, factored from `PersistentOutcomeStore`'s
hydrate/append/Zod-validate mechanism) and a durable remediation soak sink under
`NEXUS_DATA_DIR/learning/remediation-soak.jsonl` that records each audit-mode
per-signal verdict (signalKey, category, priority/severity, vote outcome + tally,
plan step count, p0 dry-run result, reason).

- Secret-scrubbed before persistence (reuses `scanForSecrets` /
  `describeSecretFindings`) — evidence never carries a secret.
- Bounded retention: last 10,000 records, oldest-evicted (no disk-fill growth).
- New `summarizeRemediationSoak` / `readRemediationSoakSummary` read surface for
  the #3764 readiness collector (counts by verdict, approval rate, breakdowns).
- Wired into the audit branch of the auto-remediation cycle.

Decision-gate evidence for the enforce-by-default arc (#3653 / #3540).
