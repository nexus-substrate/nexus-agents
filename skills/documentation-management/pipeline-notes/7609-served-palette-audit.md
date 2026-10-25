# PR #7609: Audit the website palette with its local overrides

Status: Supporting

The `Audit remarque palette and source policy` step in
`.github/workflows/deploy-website.yml` now runs
`pnpm audit:remarque --json-out /tmp/remarque-report.json` from `website/`.
The package script delegates to `website/scripts/audit-remarque.mjs`.

The wrapper concatenates `remarque-tokens/tokens-palette.css` and
`website/src/styles/tokens.css`, in that order, into a temporary palette.
It passes that palette to the package's audit tool with `--src src` and to
its drift checker. This includes the site's overrides in the palette input
instead of auditing only the package defaults.

To reproduce the pipeline command from the repository root:

```sh
pnpm --dir website audit:remarque --json-out /tmp/remarque-report.json
```

The wrapper returns a nonzero status if either child tool fails or reports
`passed: false`. The JSON output contains the full palette-audit report;
the drift summary is printed in the job log. The existing
`website-accessibility-reports` artifact still uploads this report alongside
`/tmp/a11y-report.json`. The axe and mobile-menu checks remain separate steps.
