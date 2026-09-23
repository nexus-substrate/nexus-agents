---
'nexus-agents': patch
---

`recordWorkerOutcomes` in `orchestrate-dispatch` now normalizes `resolvedCli` by stripping any adapter `cli-` prefix and validating against `CliNameSchema`, falling back to `'unknown'` instead of casting unchecked adapter provider IDs like `'cli-codex'`.
