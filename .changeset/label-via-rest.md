---
'nexus-agents': patch
---

Fix `review-pr.ts` crashing on label add, plug a tempdir leak, and widen arch-lint to `scripts/` (#4498).

**`gh pr edit` is broken repo-wide.** It fetches `repository.pullRequest.projectCards`, which now hard-errors on the Projects-classic deprecation. It exits 1 and **the edit is not applied** — verified by adding an already-existing label and watching the label list stay empty. Title and body edits fail the same way, silently leaving the old content live.

`review-pr.ts` caught that failure and inferred _"the label must not exist"_, so it ran `gh label create cli-reviewed` — but that label already exists, so the create threw **inside the catch**, with no handler, and crashed the whole review after it had already posted. The premise encoded in the handler no longer matched reality.

Labelling now goes through REST (`gh api repos/{owner}/{repo}/issues/N/labels`), which is unaffected and creates the label implicitly, so the create-then-retry dance is gone. It is wrapped so a labelling failure can never discard a review that already posted.

**Tempdir leak.** `postReviewToGitHub` creates a directory with `nexusMkdtempSync` but only `unlinkSync`'d the file inside it, leaking one directory per review — the same class as #4489.

**Why the guard missed it:** `arch-lint`'s `tmpdir-cleanup` rule was scanning `SRC_ROOT` only, so `scripts/` was invisible to the very check added to catch this. The walk now covers `scripts/` too, with a scope-appropriate rule subset — resource hygiene and hardcoded credentials apply everywhere, while layer boundaries, determinism and test hygiene remain package-source concepts (arch-lint _defines_ the mock patterns, so running test-hygiene over itself made it match itself). Widening the scan found the `review-pr.ts` leak immediately.
