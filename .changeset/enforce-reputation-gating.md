---
'nexus-agents': minor
---

Enforce reputation gating by default, and refuse hostile input explicitly (#4667)

`NEXUS_REPUTATION_GATING` defaulted to `audit`, which computed the trust
demotion for an issue carrying a prompt injection, logged _"would block under
enforce"_, and then let the actions through. Detection worked; enforcement was
off.

Two changes, deliberately together:

- **The default is now `enforce`.** `audit` remains available for rollback.
- **A hostile enforced tier now emits a `RefuseAction`** escalating to
  `security`. Previously tier 4 only meant every generated action failed the
  policy gate — the caller saw fewer approvals and no statement that anything
  had been refused, so the fail-closed escalation the rules mandate had no
  producer. Flipping the default alone would have converted a logged non-event
  into an unlogged one.

Measured before flipping, over the real triage path with only the SCM provider
mocked: **5/5 hostile inputs blocked, 0 false positives** across ordinary
maintainer language (_"please close this"_, _"URGENT"_, _"you should merge #88
first"_) and across five real repository issues run as both OWNER and
unaffiliated author.

`issue-triage-corpus.test.ts` commits that corpus, so the false-positive rate is
measured rather than assumed whenever the detection patterns change.
