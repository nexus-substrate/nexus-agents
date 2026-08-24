---
'nexus-agents': patch
---

fix(governance): the post-merge ratification backstop can see who applied the label

#4698 taught the ratification gate to require an owner-applied label and pass
`RATIFICATION_LABEL_ACTOR`. The pre-merge job produces it. The post-merge
backstop job **consumes it and never produced it** — its own evidence step wrote
only `approvals` and `labels`.

An unset step output is an empty string, not an error, so the backstop read
"applier unknown", correctly refused to treat that as ratified, and failed. Every
governor-path PR ratified by label reddened `main` after merge, unfixable by
re-running. #4698 and #4704 did exactly that.

Adds the missing producer, and `| tail -n1` on both timeline queries: `gh api
--paginate --jq` applies the filter per page, so `| last` can emit one line per
page and corrupt the step output.

Also adds `scripts/workflow-output-wiring.test.ts`, which asserts every
`steps.<id>.outputs.<name>` a job consumes has a producer in the same job. It
fails against the pre-fix workflow and passes after — the defect class is
mechanically detectable and should not need a human to catch it twice.

Governance path (the governor workflow) — requires owner ratification.
