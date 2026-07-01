---
'nexus-agents': minor
---

Opt the auto-remediation consensus→execute gate into `absolute_quorum` (#4138, epic #4130). The
remediation vote adapter now sets `errorPolicy: 'absolute_quorum'` and surfaces the #4135-stamped
response-layer `decision` (incl. `no_quorum`) on its verdict. A degraded panel (e.g. an errored
contrarian) now degrades to `no_quorum` and triggers ONE bounded re-run
(`AUTO_REMEDIATION_NO_QUORUM_RETRIES = 1`) to absorb a transient blip; a verdict that stays
`no_quorum` becomes an EXPLICIT auditable terminal "left as an issue" (zero writes) rather than an
incidental `!approved` collapse. A voter you can knock offline can only ever force a re-run of the
autonomous-execution gate, never flip it. The default (approved→proceed / rejected→skip) path is
byte-identical.
