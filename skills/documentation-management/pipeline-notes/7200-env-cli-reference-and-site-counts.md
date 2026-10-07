PIPELINE NOTE: #7200 extends `.github/workflows/docs-check.yml` with environment
and CLI reference drift steps in the existing blocking Tool Reference Drift
job. They run `scripts/generate-env-reference.ts --check` and
`scripts/generate-cli-reference.ts --check`; missing or changed pages fail.
Push filters include both generators, the shared CLI catalog parser and website
site data. The generated pages have source provenance and `diataxis: reference`,
reject empty inputs, and are indexed in `docs/README.md`. Regenerate with
`pnpm exec tsx scripts/generate-env-reference.ts` and
`pnpm exec tsx scripts/generate-cli-reference.ts`.

`scripts/inject-governance.ts` now injects and checks all four website capability
counts using the existing registry readers and the strategy-manifest registry.
This extends the existing tool-count injection rather than introducing a second
website build mechanism. `docs/ops/docops-spec.md` documents both additions.
