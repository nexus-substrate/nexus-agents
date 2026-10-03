---
'nexus-agents': major
---

Remove `maxLatencyMs` from `QualityConstraintConfig`. No configuration path ever set it: the routing YAML exposes `qualityConstraint` only as a boolean, so the stage always ran with its 10,000 ms default. That ceiling is now the named constant `MAX_QUALITY_LATENCY_MS` and routing behaviour is unchanged. Code that read the field, or passed it in an object literal, must drop it (#5842).
