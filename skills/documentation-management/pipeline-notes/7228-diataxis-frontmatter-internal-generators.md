PIPELINE NOTE: #7228 (#7198 batch C) makes `scripts/update-research-index.ts`,
`scripts/stratify-outcomes.ts`, `scripts/check-tool-distinctness.ts` and
`scripts/pr-review-eval-run-core.ts` emit `diataxis` and `audience: project` in
the frontmatter of the reports they write. Research indexes and eval runs
declare `diataxis: none` (allowed kinds in `docs/ops/diataxis-none-kinds.json`);
the stratified-outcome and tool-distinctness reports declare `reference`. The
keys come from the generators rather than hand edits, so regeneration keeps them.
