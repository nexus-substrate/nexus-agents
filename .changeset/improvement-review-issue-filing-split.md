---
'nexus-agents': patch
---

The `improvement_review` issue-filing step (the only code that shells out to `gh`) now lives in `mcp/tools/improvement-review-issue-filing.ts`, moved verbatim out of `improvement-review.ts` with no behaviour change (#6148 row 2).
