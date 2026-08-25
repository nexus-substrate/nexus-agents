---
'nexus-agents': patch
---

fix(audit): verifyChain says when `ok: true` verified nothing

`verifyChain` returns `{ ok: true }` in two cases where it checked no
cryptographic link at all:

- **zero events** — nothing to verify;
- **an un-chained log** — the first event carries no `hash`, so the whole batch
  short-circuits and no links are walked.

Both are honest verdicts (nothing contradicts them) and both were
indistinguishable from a genuinely verified chain. `verify_audit_chain` reported
`ok: true` for an empty directory, so pointing it at the wrong path — or at a
deployment where audit logging is simply off (#4768) — looked identical to a
clean chain.

The ok-variant now carries `notVerified: 'empty' | 'unchained'`, absent when
links were actually checked. `ok` is unchanged, so the threat model's accepted
position on empty logs stands; what changes is that the verdict no longer
implies assurance it does not have.

This is the mitigation the threat model asks for by name. T8 records **residual
risk HIGH** — _"'OK' is ambiguous between 'verified chained log' and
'un-chained log, nothing to verify'. Mitigation would require the tool to report
whether the log was chained at all"_ — which was true when written and is what
this adds.

Four tests, all mutation-verified, including one through the registered MCP
handler asserting the marker reaches the serialized response rather than merely
existing on the type.

Does not change the callers' behaviour: nothing fails that passed before. Making
`verify_audit_chain` warn or fail-closed on `notVerified` is a separate policy
decision (#4768).
