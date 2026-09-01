---
'nexus-agents': patch
---

docs: declare which assets ship and which are repo-only (#5143)

Nothing stated the split. Answering "are the governance documents packaged?"
meant reading `package.json#files`, listing an installed package, grepping for
runtime reads and checking two mirrors — a research task for a question with a
fixed answer.

`docs/development/PACKAGED_VS_REPO_ONLY.md` records it: what ships, what is
deliberately repo-only, the mirror pattern that lets the runtime use a
repo-only document's content without reading the file, and the two CLI paths
that legitimately need repo files and already detect their absence.

Also annotates `BUILT_IN_EXPERTS` with its source document and its gate. The
loop-tier mirror already had that; the expert mirror did not, so a reader had to
infer that `agents/*-expert.md` and the constant are kept in step by
`generate-agents-index.ts --check`.

The document leads with the failure it exists to prevent — #5084, where a
runtime asset was never copied to `dist/`, every installed copy enumerated zero
models for three CLIs, and nothing was red because the loaders fall back to `[]`.
Ends with a decision procedure for anyone adding a runtime file read.
