---
'nexus-agents': patch
---

The input sanitizer no longer hands back a string it failed to clean. Stripping a nested tag splices the surrounding fragments back into a live tag, so nesting depth N needs N passes against a cap of 5 — at depth 6 the result still contained a live `<system>` tag, reported with `wasModified: true` and no detected pattern, which is exactly what a successful strip returns. The result now carries `sanitizationIncomplete`, and the handler refuses such input at every tier. Object keys are also scanned for injection patterns; they were copied verbatim, so relocating a payload from a value into a key raised no signal at all.
