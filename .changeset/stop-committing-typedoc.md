---
'nexus-agents': patch
---

Stop committing generated TypeDoc output; derive it at build time (#4449).

The API reference is derived from TypeScript source and JSDoc — that part always worked. The problem was committing the derivation, **twice**, for **280,000 lines** across 1,951 files:

| Tree                              | Format   | Files | Lines   | Consumer              |
| --------------------------------- | -------- | ----- | ------- | --------------------- |
| `docs/api/`                       | Markdown | 20    | 126,712 | website `/api/` route |
| `packages/nexus-agents/docs/api/` | HTML     | 1,931 | 153,130 | **none**              |

The HTML tree was rendered by nothing, published nowhere, and linked from nothing — it existed only to be drift-checked, while `changeset:version` regenerated it on every release and put **5,886 lines of pure version-string churn** into every version PR. The markdown tree was never regenerated at all: three of its twenty files were artifacts the current config no longer produces, and it documented `getCapacityDashboard()` months after that method was deleted.

Both are now gitignored. The website's `prebuild` generates the markdown it renders, so the published reference is always current instead of always stale.

**Root-cause analysis of the ~40k-line churn** (measured by reproducing it, not inferred). The issue attributed it to commit-SHA permalinks; that was 36%, not the bulk:

| Cause                                             | Lines     | Share                    |
| ------------------------------------------------- | --------- | ------------------------ |
| Prettier reformatting TypeDoc output              | ~16,418   | 43%                      |
| Commit-SHA permalinks                             | 14,440    | 38%                      |
| `node_modules` paths carrying dependency versions | —         | churns on every dep bump |
| Genuine staleness                                 | remainder | the actual signal        |

Both leading causes were **asymmetries between the two configs**: `.prettierignore` covered the HTML tree but not the markdown one, and `typedoc.json` already set `gitRevision: "main"` while `typedoc.markdown.json` did not. Both are now aligned, so the generated output is idempotent — verified by two consecutive runs producing a zero-line diff.

The warning-only TypeDoc drift gate (#2027) is replaced by a **blocking generation check**. A warning-only gate is a check that cannot fail, which is why the docs rotted for months; the new job fails when TypeDoc cannot generate, or produces no pages, so the failure mode is loud rather than a silently empty API reference.

Verified end to end: with both trees deleted from disk, `pnpm -C website build` regenerates the markdown and builds 20 `/api/` pages.
