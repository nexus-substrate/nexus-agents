---
'nexus-agents': patch
---

Add `findModelsByCli(cliName)` helper to `config/model-capabilities.ts` (#2342).

The audit (#2337) flagged `buildClaudeAliasMap()` and `buildOpenCodeAliasMap()` as duplicated. On closer inspection the two builders have meaningfully different value-derivations (claude maps to `cliAlias`; opencode maps to `cliModelName`'s `provider/model` form), so a single shared builder would have forced a bad abstraction at n=2.

The honest extraction is the **filter step**, which both builders share: "iterate models for a given cliName." This is now `findModelsByCli(cliName)`, mirroring the existing `findModelsByProvider`/`findModelsByOutputModality`/etc. helpers in the same file. Both adapters use it; each retains its CLI-specific value logic.
