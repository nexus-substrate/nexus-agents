---
'nexus-agents': patch
---

fix(security): pr-reviewer reputation uses real account age (#3133)

`pr-reviewer` now fetches the PR author's real account age (via the provider's `fetchUserMetadata` → `createdAt`) and feeds it into the reputation assessment, so the `new_account` signal actually fires in the PR-review path — the Phase-3 equivalent of #3121 for `issue_triage`. Best-effort: on fetch failure, an unparseable date, or an unexpected rejection, `accountAgeDays` is omitted (never fabricated) and the review never blocks. The review result's `trustAssessment` now also surfaces `suspiciousSignals` (parity with `issue_triage`). The reputation-gating orchestration was consolidated into `pr-reviewer-helpers` (`gatePRAuthor`, `assessPRReputation`, `fetchAccountAgeDays`). Closes #3133.
