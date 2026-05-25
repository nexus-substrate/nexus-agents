---
'nexus-agents': patch
---

**feat(ci):** add producer-without-consumer detection gate (closes #3024).

The 2026-05-24 audit sweep deleted ~5,250 LOC across 7 issues (#2937, #2938, #2939, #2940, #3018, #3022) all with the same shape: a producer/utility was built and exported on a public barrel, but the consumer never landed. This adds a PR-time gate so the next sweep doesn't accumulate the same dead-code surface over a quiet six-month window.

**What the gate checks:**

Every new `.ts` file added under `packages/nexus-agents/src/**` in a PR must have at least one non-test, non-barrel import elsewhere in `src/`. Implemented as `scripts/check-new-unused-exports.ts`, run as a new `Producer/Consumer Check` job in `.github/workflows/ci.yml`.

**What it does NOT check (v1 scope):**

- New exports added to _existing_ files. Most of the audit-sweep cases were new files; new-export-in-existing-file detection requires an AST diff against the base ref and is meaningful future work.
- Type-only usage. The greedy `from '*/name.js'` grep catches both value and type imports without distinguishing.

**Opt-out:** add `// @export-no-consumer-yet — see #<issue>` to the file. The marker requires a tracking-issue reference so deferred-but-tracked work doesn't bypass the gate untraced — the rule from `.rules/track-deferred-work.md` still applies.

**Verified end-to-end:** the gate runs on the watchdog PR (#3038, which adds `src/adapters/abort-utils.ts`) and correctly reports "1 new file(s) have production consumers — OK." 7 unit tests cover the classification logic (test/barrel/declaration skipping).
