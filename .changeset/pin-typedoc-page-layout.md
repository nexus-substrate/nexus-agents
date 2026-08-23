---
'nexus-agents': patch
---

fix(docs): pin the generated TypeDoc page layout, and make `scm`'s flat page deliberate

Three of the nineteen API pages emit into `docs/api/exports/` because their source barrels carry a slash-bearing `@module exports/<name>` tag; the other sixteen carry no tag and land flat. The asymmetry reads as an oversight, so someone would eventually normalise it — and `/api/exports/pipeline` and its two siblings are live URLs. A 7-voter `higher_order` panel on #4523 resolved to keep them (5 of 6 approvers, leading share 0.833). Every voter, including the one who rejected the option, said the same thing about the remedy: a comment will not survive the next tidy-up.

So `scripts/check-typedoc-layout.ts` pins it. For every entry point declared in `typedoc.markdown.json` it computes the one path that entry point must produce — `exports/<name>.md` for the three pinned barrels, `<name>.md` otherwise — and requires exactly that, plus no nested page nobody pinned. It runs in the `typedoc-check` job immediately after generation, because there is no committed `docs/api/` tree to assert against: it has been gitignored and derived since #4449. It therefore grades whatever `docs/api/` holds and cannot detect a stale local tree; it also says nothing about page content, which is `check-typedoc-coverage.ts`'s job, or about anchors within a page.

Mutation-checked in both directions against real generated output. De-slashing `@module exports/pipeline` moves the page to `docs/api/pipeline.md` and the gate fails naming the moved URL; reverting restores it. The existing coverage gate passes under that same mutation — it compares on basename — which is why this is a second check rather than an extra assertion in the first.

`src/exports/scm.ts` is the fix that motivated the second direction. Its `@module exports/scm` tag had been inert for two years: the `(Source: …)` attribution followed it inside the same doc block, and TypeDoc folds trailing prose into a tag's content, so the name never resolved and the page fell back to the filename. The flat `/api/scm` URL was an accident. Repairing the tag to `exports/scm` was verified to move the page to `/api/exports/scm`, which #4523 forbids, so the tag is now `@module scm` with the attribution moved to a line comment above the block — effective, flat by decision, and the regenerated tree is byte-identical to before. The three nested barrels gain a do-not-de-slash note at the top of the file, and `docs/README.md` explains the split where a reader of the docs index will find it.
