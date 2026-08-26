---
'nexus-agents': patch
---

fix(ci): stop a knip failure reporting zero orphans

`runKnip` returned a bare array and yielded `[]` on every failure path — empty
stdout, unparseable JSON, a throw with no usable stdout — with stderr set to
`'ignore'` so knip's own error was discarded. `[]` is also what a clean scan
produces, so a knip broken by a reporter or config change printed
`Total orphans (knip): 0 / ✓ No flagged orphans` and the gate exited 0.

This repo carries 22 allowlisted orphans, so `total === 0` is in fact the
signature of a dead run, and nothing asserted that baseline.

The run outcome now carries `ran`, the check verdict fails when the scan did not
happen, and the message says UNMEASURED rather than clean. The stdout
classification is extracted as a pure `classifyKnipOutput` so the empty and
unparseable cases are testable without shelling out.
