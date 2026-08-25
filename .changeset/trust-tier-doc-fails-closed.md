---
'nexus-agents': patch
---

correct the trustTier field doc: absent denies, it does not allow

`PipelineStateSnapshot.trustTier`'s doc said "When absent, `trustTierRule`
allows (the existing fail-open default for unknown trust)". The rule coerces an
absent or non-numeric value to `4` and DENIES — the behaviour was hardened in
#2957/#2994 and this field doc kept describing the pre-hardening semantics.

Stale in the unsafe direction: a reader planning enforcement work would conclude
unwired producers are the safe case, when they are the deny case. Doc only —
the fail-closed behaviour is already pinned by a test and is unchanged.

Fixes #4821.
