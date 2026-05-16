---
'nexus-agents': patch
---

**Phase 7 of #2766** — document remaining backends as intentionally per-instance. Closes #2773 (minimum-viable scope).

`SICA SicaVersionManager`, `SkillLibrary`, `StrategyDistiller`, `MemoryState` (agent execution patterns), and `SharedMemoryStore` (pipeline scratch) don't have process-wide singletons. They're constructed on-demand per agent/run/instance. Forcing them into a global `MemoryRegistry` would require either (a) tracking N concurrent instances under generated keys or (b) rewriting their lifecycles to be singleton-owned — both of which exceed the architectural value at this stage.

AGENTS.md `Canonical paths` section now:

- Lists `MemoryRegistry` alongside the other canonical registries.
- Adds a `Memory contract scope` subsection explicitly documenting the per-instance backends as **out of registry scope by design**, with rationale and the Phase 7.1+ follow-up condition ("once a clear cross-process consumer needs them").

This closes the architectural piece of #2773. Phase 7.1 (deferred) would fold these in once there's demonstrated cross-process demand.
