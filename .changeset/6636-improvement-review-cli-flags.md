---
'nexus-agents': patch
---

Forward `improvement-review` CLI flags through `buildOptions` (#6636).

- Copies `--file-issues`, `--lookback-days`, `--min-sample-size`, and `--fitness-floor` from `values` into `ParsedCliArgs['options']` in `cli.ts`.
- Exposes both kebab-case and camelCase options on `ParsedCliArgs['options']` (`file-issues`/`fileIssues`, `lookback-days`/`lookbackDays`, `min-sample-size`/`minSampleSize`, `fitness-floor`/`fitnessFloor`).
- Fixes `nexus-agents improvement-review` silently dropping these arguments and falling back to default values.
