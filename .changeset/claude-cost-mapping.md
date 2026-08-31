---
'nexus-agents': minor
---

fix(cli-adapters): stop dropping the cost the Claude CLI reports

`ClaudeCliResponse` has declared `total_cost_usd` and `modelUsage[*].costUSD`
since the shape was written, and the parser reads that JSON. Neither ever
reached `CliResponse`, so **`CliResponse.costUsd` had no producer at all** —
every measured cost the CLI handed us was discarded.

Two consumers were dead as a result:

- `cli/orchestrate-command.ts:264` guards a `Cost: $…` line on
  `costUsd !== undefined`, so it never printed.
- `cli-adapters/budget-router.ts:378` —
  `const actualCostUsd = result.value.costUsd ?? estimatedCostUsd` — could never
  take its left branch, so a variable named `actual` always held an estimate and
  nothing recorded which it was.

Adds an OPTIONAL `extractCostUsd` to `ICliResponseParser`, implemented for
Claude and wired through `SubprocessCliAdapter`. The optionality carries
meaning: an absent method states "this vendor does not report cost" — true of
codex, gemini, opencode and agy — which is a different fact from a present
method returning `null` ("reports cost, and this response carried none").

`total_cost_usd` is preferred over summing the per-model breakdown, and a
costless `modelUsage` yields `null` rather than `0`, because "reported nothing"
is not "reported free".
