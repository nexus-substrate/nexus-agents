---
'nexus-agents': patch
---

feat(capability-loop): secret-less CI for auto-remediation branches (#3614)

Condition 3 of the #3540 auto-invoke gate. A bot-authored remediation branch
triggering secret-bearing CI would re-introduce the third Rule-of-Two leg
(secrets) through CI. Establishes the `auto-remediation/` branch convention
(single source of truth `AUTO_REMEDIATION_BRANCH_PREFIX` +
`autoRemediationBranchName`, with ref-injection-safe slugging) and gates the
secret-bearing CI jobs to skip it: the model-API-key `pr-review` job and the
`CODECOV_TOKEN` upload step now exclude `auto-remediation/` head branches. The
enforce path (#3618) names branches via the shared convention.
