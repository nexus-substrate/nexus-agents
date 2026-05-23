---
'nexus-agents': patch
---

**fix(security):** match triage verdicts to findings by id, not array position. Closes #2933 (P1 security).

`security-gate.ts`'s `getConfirmedBlockingFindings` filtered blocking findings using `verdicts[i]` — but `triageFindings` sorts findings by severity and may skip parse-failed verdicts, so position `i` in `verdicts` did not refer to the same finding as `blocking[i]`. A high-severity finding whose triage parse failed would be matched against a downstream verdict (often a low-severity finding's `confirmed: false`) and **silently dropped from the blocking set**.

`triageFindings` now returns `TriagedFinding[]` (each entry is `{ finding, verdict }` — pairing intrinsic, not positional). `getConfirmedBlockingFindings` and `recordTriageLifecycle` look up by `finding.id`. The duplicate `TriagedFinding` type in `severity-consensus.ts` was consolidated into `finding-triage.ts` (its natural producer) and re-exported.

Regression test exercises the exact bug: three findings (2 high + 1 low), the second high's triage response fails to parse — pre-fix the gate returned 1 confirmed blocking; post-fix it correctly returns 2 (the unverdicted high is kept under the existing fail-safe).
