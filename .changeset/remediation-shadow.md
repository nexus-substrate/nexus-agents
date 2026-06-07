---
'nexus-agents': minor
---

feat(capability-loop): shadow-mode auto-remediation selector (#3540 inc.2a)

The safe, zero-blast-radius first step of the capability loop's auto-invoke gate
(#3611). On each improvement_review run it records the decision the future gate
WOULD make per signal — "would this be auto-routed through the dev-pipeline?" —
without executing anything (no pipeline, no PR, no issue). Security-category
signals are always human-gated (never auto-remediated), even in shadow. The
accumulated records (process-scoped sink + summarize) are what the quantified
shadow→enforce exit criterion (#3612) evaluates before any enforcement (#3618)
is enabled — mirroring the learned-selection shadow tier (#3551). Best-effort:
observability never breaks the tool.
