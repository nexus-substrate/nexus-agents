PIPELINE NOTE: #7227 (#7198 batch B) makes `scripts/generate-tool-reference.ts`,
`scripts/generate-strategy-reference.ts` and `scripts/generate-repo-index.ts`
emit `diataxis: reference` and `audience: user` in the frontmatter of every page
they write (`docs/reference/tools/*.md`, `docs/reference/strategies/index.md`,
`docs/reference/capabilities.md`). The keys come from the generators rather than
hand edits, so their existing `--check` drift modes keep the declarations in
place and `scripts/check-diataxis-frontmatter.ts` sees generated pages as
declared.
