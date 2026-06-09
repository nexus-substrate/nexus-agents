---
'nexus-agents': patch
---

ci(capability-loop): explicit Rule-of-Two secret gating on auto-remediation branches (#3778)

Add the explicit `auto-remediation/` prefix guard to the two secret-bearing
PR-triggered workflows that lacked it — self-dogfood (model-driven review;
previously relied only on draft-status) and link-check (the plan doc is
markdown, matching its path filter, and the job carries GITHUB_TOKEN). Plus a
regression test asserting all four secret PR-workflows (ci, pr-review,
self-dogfood, link-check) carry the guard, so a new secret workflow can't
silently expose secrets to bot-branch content. Surfaced by the #3770 review.
