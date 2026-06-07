---
'nexus-agents': patch
---

feat(capability-loop): `nexus-agents auto-remediate` command — start the soak (#3671)

The user-facing surface for the auto-remediation cycle. Reads
`NEXUS_AUTO_REMEDIATE` (off default | audit | enforce) and runs one
`runAutoRemediationCycle`. OFF unless explicitly enabled; `audit` produces the
vote/plan soak data with zero writes; `enforce` stays structurally unavailable
until the Option B implement adapter (#3669). `--format json` for machine output.
Maintainer-tier command; never auto-merges. Completes #3671.
