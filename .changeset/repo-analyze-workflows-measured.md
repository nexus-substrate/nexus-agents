---
'nexus-agents': patch
---

repo_analyze: report `workflowsMeasured` instead of treating an unlistable `.github/workflows` as "no workflows"

`fetchWorkflowEntries` returned a bare `[]` on any error, so a 403 from a secondary rate limit — or a token without `contents` scope — was indistinguishable from a repo with no workflows. `securityTooling` came back empty and the analysis asserted "No SAST/SCA security scanning configured" for repos running CodeQL, which `repo_security_plan` then consumed as `existingTooling` and planned remediation against a control that already exists.

The sibling `fetchDotGithubEntries` twelve lines below already returned `listed: false` for exactly this reason (#6018); the workflows fetch never got the same treatment.

`RepoAnalysis` gains a required `workflowsMeasured: boolean`, and the SAST gap now has three outcomes rather than two: removed when a scanner is detected, stated as unverified when the listing failed, and asserted only when a successful listing found nothing.
