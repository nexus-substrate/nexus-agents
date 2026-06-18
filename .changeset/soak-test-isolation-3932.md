---
'nexus-agents': patch
---

fix(remediation): isolate soak/shadow tests from the production data dir (#3932)

The auto-remediation cycle's default durable soak sink resolves under
`NEXUS_DATA_DIR` (falling back to `~/.nexus-agents/learning/remediation-soak.jsonl`).
Audit-mode cases in `auto-remediation-cycle.test.ts` ran `runAutoRemediationCycle`
without injecting a `soakSink`, so synthetic fixture records (signalKeys `a`/`b`)
were written into the operator's real home-dir soak file — inflating the
enforce-readiness `volume` criterion with non-real data.

The cycle test now pins `NEXUS_DATA_DIR` to a throwaway temp dir for the whole
suite (with singleton reset + cleanup), a regression guard asserts the soak file
resolves under the temp data dir and never the home dir, and the readiness read
path now drops structurally-implausible soak records (signalKeys lacking the real
`category:detail` shape) as defense-in-depth so junk can't inflate the volume count.
