---
'nexus-agents': patch
---

Report an unverified auth probe as unverified, not as a failure (#4661)

`doctor` printed a red **"Not authenticated"** with `Fix: gemini auth login` for
a CLI that was working — a vote succeeded on it 30 seconds earlier in the same
session.

The auth probe is three-valued. For a gateway with no non-interactive auth
check it can only ever return `unknown`, explicitly _"admitted unverified"_.
Routing treats that correctly and deliberately (#4391: absence of evidence is
not failure, and #4346 is what happens when you get it wrong). `doctor`
collapsed it to a boolean at the last step, so an unmeasured state rendered as
a definite negative with a remediation that fixes nothing.

`CliCheckResult` now carries `authState: 'authenticated' | 'unverified' |
'not-authenticated'`. Unverified prints in yellow as
`unverified (no non-interactive auth check)` — the same honest register as the
existing `Capacity: unknown (no usage observed this session)` line — and no fix
command is offered, because there is nothing to fix.

`authState` is required rather than optional, so every construction site has to
say which state it means.
