---
'nexus-agents': patch
---

`run_graph_workflow`: the `security-audit`, `test-generation` and `documentation` graph templates no longer label their steps `[claude]`, `[codex]` or `[gemini]`. These templates run local substring and regex checks and call no model, so a step such as `[claude] Threat modeling: 2 surfaces identified` claimed a review that never happened. Steps now read `[heuristic] …` (for example `[heuristic] Threat surfaces: 2 identified`), and the template descriptions and the tool description say the templates call no model. If you match on the old step prefixes, match on `[heuristic]` instead. The exported `CliAssignment.preferredCli` field is unchanged; it now documents the model family each node was designed for, not one that runs it.
