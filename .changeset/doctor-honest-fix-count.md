---
'nexus-agents': patch
---

stop doctor reporting a fix it did not make and a count that contradicts its verdict

Two defects in `doctor`, both reporting success it had not achieved.

**`--fix` claimed to create directories when it created none.** The fix runs when
a data subdirectory is missing **or not writable**, but `ensureDir` returns early
for a path that already exists and never checks writability. An
existing-but-unwritable directory therefore lands in `alreadyExisted`, `failures`
stays empty, and `success` is true — so doctor printed
"✓ Created missing data directories" and incremented the fix count for precisely
the condition that triggered it. `created.length` was already on the result and
was not consulted; a new `describeDataDirFix` now reads it and says plainly that
setup cannot repair permissions.

**The summary count contradicted the verdict.** `totalIssues` enumerated CLIs,
node version and `mcpServerReady`, while `isAllHealthy` additionally fails on an
unacceptable scratch severity. A critical scratch filesystem with everything else
healthy printed `Summary: 0 issue(s) found` — a summary shown only because
something is wrong, saying nothing is wrong. The count now includes the same
term the verdict reads, and `scratchSeverityIsAcceptable` moved next to
`worstSeverity` so both callers share one definition rather than the count
drifting from the verdict again.

Fixes #4851.
