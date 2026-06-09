---
'nexus-agents': patch
---

feat(execute_expert): surface the expert's self-reported confidence in `ExecuteExpertResponse` (#3766). Experts emit an `ExpertOutput`-shaped analysis carrying a numeric `confidence` (0-1), but it was dropped when the MCP boundary stringified the output. Added an optional `confidence?: number` field (plus a fail-safe `extractExpertConfidence` helper, validated to `[0,1]`) and re-stated it in the tool description. Additive and backward-compatible; consumers can now route/weight on the real per-expert confidence instead of the success=1/fail=0 placeholder.
