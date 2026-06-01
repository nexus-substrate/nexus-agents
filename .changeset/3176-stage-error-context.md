---
'nexus-agents': patch
---

fix(pipeline): preserve error context in stage execution (#3176, #3144 P0)

Stage-execution catch blocks used `String(e)`, which mangles non-Error throws to `"[object Object]"` and drops the real message. Replaced with `getErrorMessage(e)` across the 9 stage wrappers (`stage-wrappers.ts`) plus the orchestration CLI-plan-parse and triangulated-review error paths, so a thrown object/string surfaces its actual message in `StageOutput.error` and logs.
