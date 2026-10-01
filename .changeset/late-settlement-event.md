---
'nexus-agents': patch
---

Measure voter calls that settle after the panel's overall deadline cancels them.
Append one `voter_late_settlement` measurement to the existing monthly usage log
with role, CLI, model when known, milliseconds after the deadline, settlement
status, `settledBy: 'abort' | 'adapter'`, and token usage only when reported.
Caller-abort results (including immediate deadline aborts, and a voter that ended
with the seat-cancelled error) have `settledBy: 'abort'`; only
`settledBy: 'adapter'` rows represent genuine late adapter settlement. Rows for
subprocess CLIs also carry `stdoutBytes` and `sawFirstByte`, which tell a call
that had started answering when it was terminated from one that had produced no
output.

This is a lower-bound measurement: a promise that never settles, or a process that
exits before settlement, writes no event. Rows with a `kind` field, including
unknown or malformed measurements, are excluded from cost totals and from the
"unreadable rows" warning; their count is logged at debug level only, so
`nexus-agents usage` output is unchanged. They do not change vote verdicts, deadlines,
retries, or captured usage. A failing measurement is logged as a warning and cannot
affect the deadline path.
