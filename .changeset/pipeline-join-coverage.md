---
'nexus-agents': minor
---

`weather_report` and `nexus-agents health` now report how well dev-pipeline stage outcomes join to their recorded run traces. Four optional fields are added to the consensus decision-token section:

- `matchedPipelineRuns`
- `unmatchedPipelineOutcomeRows`
- `pipelineOutcomeJoinCoverage`
- `unreadablePipelineTraces`

Coverage is `null` (unmeasured) when there are no traced runs, or when any trace could not be read. Malformed, oversized and unsafe traces are counted rather than interrupting the report. Traced runs with no stage outcomes report `0`. Only traces with dev-pipeline stage attribution count, so a `run_pipeline` contract id that happens to start with `pipeline-` is excluded. So is a session id too long to fit an outcome row's trace id. Traces older than the report window are skipped without being read. The routing weather bonus never reads traces. A joined stage does not imply its artifact was validated.
