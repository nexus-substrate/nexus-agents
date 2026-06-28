---
'nexus-agents': patch
---

Stop silently succeeding a pipeline stage whose plugin is missing (#3178). When a
`StageSpec` references a plugin that isn't in the registry, the compiler falls back
to a no-op placeholder (resilience, #1179) — but it used to report `status:
'completed'` indistinguishably from a real execution, so a typo'd or unregistered
`pluginId` ran as a no-op and reported success with no signal (a silent failure).

The placeholder fallback is now LOUD: the compiler logs a warning naming the stage
and the unregistered `pluginId` at compile time, and the stage result carries a
`placeholder: true` marker so an inspector can tell a skipped no-op from a real
execution. Compilation still succeeds (the #1179 resilience contract is preserved).
The deeper composability refactor in #3178 (a typed `StageContext` / `NodeHandler`
factory / stage→node mapping) remains tracked separately.
