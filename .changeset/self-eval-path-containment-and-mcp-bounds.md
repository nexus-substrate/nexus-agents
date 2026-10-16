---
'nexus-agents': patch
---

Enforce workspace root containment on `selfEvalReportPath` in `loadSelfEvalSignals` via `resolveInsideRoot` (CWE-22) and add upper bounds across MCP tool input schemas (`selfEvalReportPath`, `projectDir`, `iteration`, `maxTokens`, `maxTriggers`, `prNumber`, and `minStars`) (#7463).
