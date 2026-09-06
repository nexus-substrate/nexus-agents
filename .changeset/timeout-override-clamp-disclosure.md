---
'nexus-agents': minor
---

Report a timeout knob that is set, valid, and silently discarded.
`NEXUS_TIMEOUT_CLASS_ASYNC_JOB_BODY_MS` above 3600s is accepted by the schema
and thrown away, and every `NEXUS_TIMEOUT_MULTIPLIER` above 1 is a no-op for
that class, because its declared guard sits exactly at the MCP request ceiling —
for `async-job-body` the two documented knobs can only lower the guard.
`describeClassGuard` now reports what was requested versus what was used and
which knob was reduced, and `validateNexusEnv` warns about it alongside the
unknown-name and invalid-value reports it already produced.
