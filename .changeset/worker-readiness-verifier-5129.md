---
'nexus-agents': minor
---

feat(pipeline): verify readiness at the actual worker boundary (Task T06, #5129)

Adds `worker-readiness.ts` implementing worker/session-scoped capability readiness verification (`READINESS_LEVELS`, `ReadinessProofCache`, `isProofValidForContext`, `isWriteOperation`, and `verifyWorkerReadiness`) and integrates preflight worker readiness checks into `PipelineRunner.execute`.
