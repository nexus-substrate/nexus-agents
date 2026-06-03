---
'nexus-agents': minor
---

Wire the local QA gate into `run_dev_pipeline` as a pre-ship stage (#3356 Step 2). A new `qualityGate` option (`'off' | 'advisory' | 'blocking'`, default `'off'`) runs the same `runQualityGate` engine (typecheck/lint/tests) after implement, before the security scan: `advisory` records feedback without failing the pipeline, `blocking` fails the phase on a red gate (same posture as a blocking security finding), and `off` (the default — safe for repos lacking standard build/test scripts) skips it. The stage is a thin caller over the one canonical engine (no new check logic), and is an optional `DevPipelineStages` method so existing consumers are unaffected. Completes the consensus-ratified wiring begun with the `run_quality_gate` MCP tool.
