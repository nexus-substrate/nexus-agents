---
'nexus-agents': patch
---

Correct the documentation of the worker quality gate used by `orchestrate`. It said worker output was checked by a default gate (non-empty, 10 to 100,000 characters). No such default ever ran: `executeWorkerDispatch` applies a gate only when a caller passes one, and the `orchestrate` tool passes none, so its worker output is not gated. The docs now say so, and a test fails if a default is wired in without the docs changing. The unused helpers behind the old claim (`DEFAULT_QUALITY_GATE`, `composeGates`, `nonEmptyGate`, `outputLengthGate`, `MIN_OUTPUT_LENGTH`, `MAX_OUTPUT_LENGTH`) are removed. None was on the published API surface. The `qualityGate` option, the `QualityGateFn` type and `applyQualityGate` remain.
