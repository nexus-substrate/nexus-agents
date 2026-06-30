---
'nexus-agents': patch
---

Single-source the CLI on-error usage examples from `COMMAND_HELP` (#3209, epic #3691).
`printVoteUsage` / `printOrchestrateUsage` previously hand-maintained example strings that
had drifted from each command's `--help` examples; they now render their Examples block
from the shared `getCommandHelp(command).examples`, so the on-error usage can't diverge from
`nexus-agents <cmd> --help`. A drift-guard test pins the single-source invariant. Completes
the residual of #3209 — the description consolidation already shipped via #3212's parity-gate
(Option B) and the help-text derivation.
