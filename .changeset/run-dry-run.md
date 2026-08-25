---
'nexus-agents': minor
---

let `run` request a dry run, and refuse where it cannot be honoured

`run` is the documented default entry point, but it could not express the
cautious caller's first request — plan and vote without implementing. It always
built its pipeline input as `{ task: goal }`, so `dryRun` took its `false`
default and `run` was strictly less capable than the tool it delegates to, with
nothing saying so. (`execute: false` is not a substitute: it returns the
selected strategy, having done no planning and no voting.)

Adds `dryRun` to `run`. Only the dev-pipeline strategy stops after plan+vote, so
when the router selects any other strategy the call is REFUSED with a `business`
error before any executor runs — silently ignoring a do-not-act flag is the one
outcome a governance substrate cannot allow.

`mode` and `qualityGate` stay pipeline-specific vocabulary reachable through
`run_dev_pipeline`; forwarding them would leak one strategy's config into a
strategy-agnostic surface.

Fixes #4806.
