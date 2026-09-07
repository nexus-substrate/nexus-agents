---
'nexus-agents': patch
---

`runGraphPipeline` now reports how much of the template it covered. A dry run
truncates the stage list at `dryRunStopAfter` — for the dev/general/greenfield
templates that drops decompose, implement, qa and security — but the result
still carried `success: true` and the FULL `templateId`, so a 3-of-7 dry run was
byte-identical to a complete run. `GraphPipelineResult` gains `dryRun?: true`
(mirroring `DevPipelineResult`, which already had it) plus `stagesPlanned` and
`stagesRun`, and `run_pipeline` surfaces all three.
