---
'nexus-agents': patch
---

chore(lint): restrict createAllAdapters so new call sites fail (#5191)

CLAUDE.md names `getGlobalRegistry()` canonical for adapter acquisition and says
"NOT `createAllAdapters()` in new code". Measured on main: the deprecated path
had **7 real call sites** to the canonical path's **1**.

The two differ. `adapters/unified-registry.ts:150` passes a shared
`circuitBreakerRegistry` with an explicit note that per-adapter registries "would
let one adapter keep routing to a CLI another has already seen fail" (#4330).
`createAllAdapters` returns raw adapters, so each caller's breaker state is
isolated — reintroducing exactly that.

Uses the stock `no-restricted-imports` rule rather than a bespoke gate, per epic
#5121's constraint 1. The four existing static call sites are visible at `warn`
in a named block — the same shape as the vacuous-verdict exemption — so the debt
shows in every lint run instead of being silenced. A NEW call site is an error.

Two coverage notes, stated rather than papered over. The rule does not catch
`const { createAllAdapters } = await import(...)`, which two sites use; they are
enumerated in #5191. And `exports/cli-adapters.ts` is exempt because it
_re-exports_ the symbol on the public API — removing it from the public surface
is a semver decision for #5191, not a lint side effect.

No behaviour change; lint-only.
