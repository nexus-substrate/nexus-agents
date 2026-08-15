---
'nexus-agents': patch
---

`pr_review` now rejects a `prDiff` that is not a unified diff (#4451).

Previously `prDiff` was validated by length alone, so **a prose summary of a change was accepted**: it ran a full 5-voter panel and persisted a `verified: true` governance record whose `reviewedDiffHash` was the hash of the prose. Nothing in the record distinguished it from a review of real code, and the panel approved a PR that warranted `request_changes` — because it never saw any code.

Validation accepts any unified diff, not only git's: a `diff --git` header, an `@@ … @@` hunk header, or the `---`/`+++` file-header **pair**. All markers are line-anchored, so prose that merely mentions them does not qualify. Non-git diffs from `diff -u`, `svn diff`, or a patch file remain valid, as do rename-only, binary, mode-only and CRLF diffs.

The `---`/`+++` markers are required together rather than alone: a lone `---` line is too weak a signal, since prose uses dashed rules and section headers routinely (`--- Release notes ---`). In a real unified diff the two always co-occur, so requiring the pair costs nothing and closes that gap.

A hunk header alone is not enough either: `@@ -1 +1 @@` prepended to a paragraph must not qualify, so the hunk path additionally requires `+`/`-` body lines. `diff --git` stands alone, since rename-only, mode-only and binary diffs legitimately carry no body lines.

**The check runs at two boundaries, not one.** The schema guards the MCP entrance, but `scripts/pr-review-local-ledger.ts` builds a `PrReviewInput` literal and calls `persistReviewRecord` directly, never touching the schema. Since the harm is a fabricated `verified: true` **ledger record**, `persistReviewRecord` now refuses with `reason: 'diff-not-unified'` — otherwise the gate covered one of two doors into the thing it protects.

The predicate (`looksLikeUnifiedDiff`) lives beside `splitByFile` in `pr-review-diff-budget.ts` so one module owns what a diff looks like. `splitByFile`'s own tolerance of unstructured input is unchanged — that is correct for the budget packer, which should pack whatever it is handed; the gate belongs at the boundaries instead.

Known limitation: a _non-git_ binary-only diff (`Binary files a/x.png and b/x.png differ` from `diff -u`/`svn`, with no `diff --git` line) carries no marker and is rejected. Git's own binary diffs are unaffected.

This closes the input path. It does not retroactively mark existing records, and it cannot tell whether a syntactically valid diff is the diff actually under review — record provenance metadata remains tracked on #4451.
