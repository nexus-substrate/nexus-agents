---
'nexus-agents': patch
---

stop the warm-start skip warning burying real regressions under an expected one

`skippedByArm` was added so an arm that should have warm-started and did not
would be visible — `api:*` arms had been discarding their entire history
silently. It then also reported `'unknown'`, the deliberate sentinel for
outcomes whose executing CLI cannot be resolved, which can never warm-start by
design and appears on every run. A live run logged
`skippedByArm: {"unknown": 210}` against 3,488 replayed.

So a genuinely regressed arm would have rendered exactly like a warning
operators had been trained by repetition to skip past. The two are now
separated: an unmatched arm-shaped id still warns, the unattributed bucket is
counted and logged at debug. An empty `skippedByArm` again means what the field
was built to mean — every arm with history warm-started.

The count is kept rather than filtered away; its volume says how much execution
cannot be attributed to a CLI, which is worth seeing somewhere.

Which bucket warrants which level is now a pure function, so the level is
assertable without mocking the module logger.
