---
'nexus-agents': minor
---

feat(orchestration): give the authority ladder a refusal that can actually fire

Neither authority refusal code could fire in production. `dispatchActionClass`
returned `'suggest'` unconditionally for both dispatch modes, every live
strategy declared `suggest` or higher, and the strategy union is exactly the
eight that have manifests — so `above_declared_tier` had no reachable input and
`tier_undeclared` had none either.

Raising the mapping does not fix it: measured, `execute -> 'advisory'` refuses
7 of 8 strategies and `execute -> 'enforce'` refuses all 8, which halts
essentially all execution.

Instead, ADR-0017's own phrase — `enforce` acts "within its declared, bounded
envelope" — becomes representable. `StrategyManifest.executeEnvelope` declares
`filesystem`, `spawn`, `network` and `vcs` scope from closed enums with no
wildcard member, and `run { execute: true }` refuses fail-closed when the
selected strategy declares none. Absence means "cannot execute", never
"unbounded".

The declaration is cross-checked rather than trusted: an envelope must be
present exactly when `executorAvailable` is true, `research`'s must equal
`pipeline`'s (it is a literal alias of that executor), and none may be maximal
in every dimension.

This is a declaration check, not runtime sandboxing — it refuses an undeclared
strategy, it does not detect a mis-declared one. Runtime confinement remains
`NEXUS_SANDBOX`.

Also corrects the `run` tool's routing NOTE, which still told callers to wait
for inline execution "in a later release" after it had shipped.
