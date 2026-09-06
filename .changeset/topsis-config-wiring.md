---
'nexus-agents': minor
---

A `routing.topsis` block in nexus-agents.yaml now reaches the ranking stage. `adaptRoutingConfig` returned three of the four stage configs and dropped topsis, and the stage constructed itself with no arguments — so an operator writing `minQualityThreshold: 9` was schema-validated, defaulted, and then ranked with the built-in 5. The adapter for it already existed with no caller. CONFIGURATION.md also documented `qualityWeight`/`costWeight`/`latencyWeight`, which are not in the schema and were stripped by zod before any consumer saw them; the examples now use the real `criteria` shape.
