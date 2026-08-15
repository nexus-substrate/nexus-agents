---
'nexus-agents': patch
---

`pr_review` now rejects a `prDiff` that is not a unified diff (#4451).

Previously `prDiff` was validated by length alone, so **a prose summary of a change was accepted**: it ran a full 5-voter panel and persisted a `verified: true` governance record whose `reviewedDiffHash` was the hash of the prose. Nothing in the record distinguished it from a review of real code, and the panel approved a PR that warranted `request_changes` — because it never saw any code.

Validation accepts any unified diff, not only git's: a `diff --git` header, a `---`/`+++` file-header pair, or an `@@ … @@` hunk header. All markers are line-anchored, so prose that merely mentions them does not qualify. Non-git diffs from `diff -u`, `svn diff`, or a patch file remain valid.

The predicate (`looksLikeUnifiedDiff`) lives beside `splitByFile` in `pr-review-diff-budget.ts` so one module owns what a diff looks like. `splitByFile`'s own tolerance of unstructured input is unchanged — that is correct for the budget packer, which should pack whatever it is handed; the gate belongs at the entry boundary.

This closes the input path. It does not retroactively mark existing records, and it cannot tell whether a syntactically valid diff is the diff actually under review — record provenance metadata remains tracked on #4451.
