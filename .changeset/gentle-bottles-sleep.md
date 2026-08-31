---
'nexus-agents': patch
---

fix(ci): make the tool-distinctness fallback threshold reachable

`loadBaseline()` in `scripts/check-tool-distinctness.ts` fell back to
`threshold: 1.1` when the baseline file was absent, and used the same value
when a present baseline omitted the key. Flagging is `similarity >= threshold`
over cosine similarity, which is bounded at 1.0 — so the fallback could not
fire for any corpus. `flagged` was always empty, `ok` was always true, and the
gate printed "Tool distinctness OK — 0 pair(s) at/above threshold 1.1" and
exited 0 from the required `lint` job.

The committed baseline carries `0.5`, so the gate does work today; deleting the
file or dropping the key would have silently disabled it while still rendering
a green check a reviewer reads as "tool descriptions were compared".

Both fallback sites now use an exported `DEFAULT_THRESHOLD = 0.5` (the value
the baseline has carried since #2676), and the defaulting logic is extracted
into `normalizeBaseline()` so both paths are covered by one tested function.
With the baseline removed, the gate now actually compares and flags
`research_add` ↔ `research_add_source` at 0.531 instead of reporting a pass.
