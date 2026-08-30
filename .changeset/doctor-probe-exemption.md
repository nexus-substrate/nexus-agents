---
'nexus-agents': patch
---

docs(cli): record the doctor probe exemption as a decision, pinned by a test (#5191)

`doctor` and `doctor-live` acquire adapters via `createAllAdapters()` rather than
the canonical `getGlobalRegistry()`. That looked like drift against
CLAUDE.md's canonical-paths table; a panel ratified it as deliberate (option A,
4/6).

The reason is specific: registry adapters share a circuit-breaker registry
(#4330), which is right for execution and wrong for a liveness probe. An open
breaker would make doctor report a CLI unavailable **without testing it** — the
probe would be reading its own cached memory rather than measuring the CLI.

Both sites now state that, and a test pins it, per the architect's condition: a
future "route everything through the canonical path" cleanup cannot silently turn
a probe into a breaker-state readout. Verified in both directions — swapping in
`getGlobalRegistry()` fails, and stripping the explanatory comment fails.

Documentation and tests only; no behaviour change. The `expert-bridge` migration
that was A's other half is **blocked** on registry API gaps recorded in #5191:
the registry has no all-CLI-adapters accessor, and its per-CLI type
(`IResilientAdapter extends IModelAdapter`) is not the `ICliAdapter` that
`createCompositeRouter` requires.
