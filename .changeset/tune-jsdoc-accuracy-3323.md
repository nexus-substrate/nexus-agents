---
'nexus-agents': patch
---

docs(tune): correct stale TuneStageOptions JSDoc (loop is default-ON) (#3323)

The `TuneStageOptions.enabled` JSDoc still said "When false (default), SHADOW
mode", but `startTuneStage` derives the default from `NEXUS_TUNE_ENFORCE` which
defaults to `true` (enforce) since v2.96 — production runs the self-tuning loop
default-ON. Corrected the comment so a maintainer isn't misled into thinking the
loop is shadow-by-default. (CONFIGURATION.md already documents the default-ON
behavior + opt-out accurately.)
