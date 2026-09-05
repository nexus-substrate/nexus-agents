---
'nexus-agents': patch
---

Fix review integrity so security expert output with only rejected findings reports unmeasured coverage and a fail-closed score of 0, while partial results score only validated findings and disclose reduced coverage to the PR reviewer. The reviewer keys its non-approving errored decision on findings coverage rather than the placeholder score.
