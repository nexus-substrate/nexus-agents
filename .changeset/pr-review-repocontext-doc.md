---
'nexus-agents': patch
---

Document the `pr_review` `repoContext` 2000-char cap (#4133, epic #4130). The field silently
hard-failed Zod validation over 2000 chars with no limit stated in its description (unlike
`prDiff`, which documents its 50000 cap). The cap is now a named `MAX_REPO_CONTEXT_LENGTH`
constant and stated in the field description + regenerated tool reference. The larger
diff-summarization affordance for the 50000-char `prDiff` cap is tracked separately.
