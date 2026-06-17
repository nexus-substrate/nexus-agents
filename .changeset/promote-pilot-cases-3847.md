---
'nexus-agents': patch
---

feat(eval): promote 9 outcome-mined cases into the trusted pr_review sample (n=10→19) (#3847)

Promotes the owner-approved, independently-adjudicated pilot into the TRUSTED
`pr_review` eval set (`testing/datasets/pr-review-sample.json`). Nine REAL merged
PRs from `nexus-substrate/nexus-agents` are added as new eval cases via
OUTCOME-MINING: the label is derived from the presence (buggy) or absence (clean)
of a confirmed corrective follow-up PR in the harvested window — distinct from the
synthetic v5 cases (new provenance source `outcome-mined`).

**Buggy (3)** — each `customDiff` carries the real ORIGINAL code hunk the
corrective PR later changed:

- **#3915** (medium) — silently-swallowed audit/cost persist failures.
  Corrective: **#3918** (fail-loud + rate-limited cost warn).
- **#3893** (high) — promotion gate only checked `ratificationVoteRef` non-empty,
  never that it RESOLVED to a real approved vote. Corrective: **#3895**.
- **#3873** (high) — `claims:check` gate never READ the subject docs it claimed
  to verify. Corrective: **#3884**.

**Clean (6)** — Rule 3 clean (confidence ~0.7, "no known defect"), no corrective
PR in the harvested window: **#3913, #3912, #3908, #3905, #3900, #3899**.

`#3886` was held by the owner and `#3892` (unsettled label) were excluded. All 10
prior v5 cases are preserved unchanged. The dataset schema gains the
`outcome-mined` provenance source; the dataset validator/test stays green
(n=19, class balance buggy=10 / clean=8 / borderline=1).
