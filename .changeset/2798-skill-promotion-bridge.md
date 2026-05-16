---
'nexus-agents': minor
---

**Closes #2798. Phase 6 of #2792 (cross-cutting memory access).**

Per-instance memory backends stay per-instance; the **signal they produce** now reaches the shared substrate via promotion bridges.

### What ships

- **`SkillLibrary` → shared beliefs (wired)**. New optional `SkillLibraryConfig.skillPromoter` callback. When a skill crosses `minSuccessesForPromotion` (default 5 successful executions), the bridge fires once with `{skillId, name, category, successRate, executionCount}`. The production global library in `cli-server-skills.ts` wires this to `getToolMemory().recordBelief('skill:{name}', 'is_reliable_for', '{category}', 'high'|'medium')` so every later `getContextForTask` call sees the learning regardless of which agent ran the skill.

- **`SicaVersionManager` and `MemoryState` → documented templates**. AGENTS.md grows a new sub-section (`Per-instance → shared-substrate promotion`) with a table describing the signal/target/wiring shape for each backend. SICA and MemoryState bridges are not wired today — the template shows how to add them when a concrete need materializes (mirror the SkillLibrary pattern: optional config field + dynamic-import promoter in the per-singleton wiring point + dedicated test).

### Design choices

- **Fire once, not on every event.** Promotion is gated by a "just-crossed-threshold" check using the previous + updated metrics. Re-firing on every subsequent success would flood the belief store.
- **Defensive isolation.** Throws and promise rejections from the promoter are caught inside `SkillLibrary.maybePromote` so a broken bridge never breaks local skill bookkeeping.
- **Dynamic import in production wiring.** `cli-server-skills.ts` reaches `getToolMemory` via `await import(...)` to avoid a hard module-load circular dep with `mcp/tools/`.

6 new tests cover: threshold crossing, no-re-fire, no-fire-on-failure, throw isolation, async-rejection isolation, event payload shape.

This closes the autonomous loop for the full #2792 epic: outcomes → distilled rules → skill-promoted beliefs → `ContextRetriever` → every entry point.
