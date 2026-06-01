---
'nexus-agents': patch
---

refactor(pipeline): name the pipeline policy fn evaluatePipelinePolicy at source (#3194)

The pipeline `policy-evaluator` function was named `evaluatePolicy`, colliding with
the unrelated MCP-middleware `evaluatePolicy`. The public `exports/pipeline.ts`
already aliased it to `evaluatePipelinePolicy` to dodge the clash; this renames the
source function so the alias hack is gone and the symbol is unambiguous in-tree.
No public API change (the exported name is unchanged).
