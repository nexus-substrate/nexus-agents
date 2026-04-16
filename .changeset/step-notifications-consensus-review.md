---
'nexus-agents': patch
---

feat(orchestration): wire step notifications into consensus-plan + triangulated-review

Second wave of step-notification migrations (follows #1930). Both
multi-CLI orchestration entry points now emit `step.started`/`completed`
events to the shared step bus, with useful summaries:

- `consensus-plan` → `"3 agreed, 1 divergent, 3/3 CLIs"`
- `triangulated-review` → `"7 findings (12 raw), 3/3 CLIs"`

The previous `logger.info` start/end pairs are replaced by `withStep(...)`;
the ILogger is still used for per-CLI dispatch logs and outcome recording.
JSON logs remain the source of truth (step events flow through the same
bus and get logged by the existing bridge).
