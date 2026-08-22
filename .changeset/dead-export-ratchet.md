---
'nexus-agents': patch
---

The producer/consumer gate now works at export level on modified files, blocking only what a PR adds.

Decided by a 7-voter `higher_order` panel at the supermajority bar: **unanimous, 6 of 6 approvers**, after a first vote was stopped mid-flight because its leading option rested on a false premise.

**What was withdrawn, and why.** The original plan was to extend `knip` (already installed) to report unused exports. Measured instead of assumed: knip reports **2,355 unused exports** and flags **zero of five confirmed-dead ones**, because it counts a test-file import as consumption — and "imported only by its own test" is the defining shape of this defect class. Knip is simultaneously too noisy to promote and structurally blind to the target.

**What ships.** `scripts/check-new-unused-exports.ts` already had the right semantics — a consumer is a non-test, non-barrel import — but only inspected newly _added_ files. It now also inspects _modified_ files at export granularity, splitting findings:

- an export **this PR added** with no production consumer → **blocks**
- an export **already dead** in a file the PR touched → **advisory**, listed and not blocking

That split is measured, not stylistic. Blocking on pre-existing dead exports flagged 14 on a real two-file merge; a gate that bills an unrelated PR for old debt teaches people to reach for the opt-out marker, which is how a gate stops meaning anything.

Verified in both directions: adding an unconsumed export to `codex-limits.ts` exits 1 and names it, while `checkCodexDepth` and two constants appear in the advisory list; a clean branch exits 0.

**One bug caught by running it.** The first implementation filtered the production haystack with `isTestSupportFile`, which means "lives in `src/testing/`" — not "is a test". Test-only imports therefore counted as production use, reproducing knip's exact blindness inside the fix for it. Found because a known-dead export produced no advisory line. A regression test now pins the distinction.
