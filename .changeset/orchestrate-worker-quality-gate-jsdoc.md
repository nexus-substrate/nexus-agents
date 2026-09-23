---
'nexus-agents': patch
---

Correct `WorkerDispatchOptions.qualityGate` JSDoc in `mcp/tools/orchestrate-dispatch.ts` to document that no gate runs unless one is explicitly passed, resolving drift with runtime behavior. Removed unused vestigial quality gate helpers (`DEFAULT_QUALITY_GATE`, `composeGates`, `nonEmptyGate`, `outputLengthGate`, `MIN_OUTPUT_LENGTH`, `MAX_OUTPUT_LENGTH`) that had no production consumers.
