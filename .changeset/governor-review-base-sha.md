---
---

Fix the governor-review CI gate: pass `PR_BASE_SHA` to the gate step so the Option-C diff-binding (`git diff base..head`) actually runs (#4227). Without it the gate's core diff-match was inert — it could never match a pr_review record regardless of ledger contents. No package code change (workflow only).
